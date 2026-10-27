import type { App } from 'obsidian';

import { ComponentEx } from '@mnaoumov/obsidian-lib/components/component-ex';
import { requestUrl } from 'obsidian';

import type { PluginSettingsComponent } from '../../plugin-settings-component.ts';
import type {
  EmailMessageFull,
  EmailMessageSummary
} from '../email-provider-types.ts';
import type {
  EmailProvider,
  EmailProviderDownloadAttachmentParams
} from '../email-provider.ts';
import type { MailTmDomainManager } from './mail-tm-domain-manager.ts';

import {
  generatePassword,
  generateUsername
} from '../../string-generators.ts';
import { EmailProviderAuthenticationError } from '../email-provider-authentication-error.ts';
import { MAIL_TM_API_BASE_URL } from './mail-tm-constants.ts';

// A JWT is `header.payload.signature`; only the first two parts are needed, and the limit keeps a
// signature containing `.` from producing extra segments.
const JWT_HEADER_AND_PAYLOAD_PART_COUNT = 2;
const HTTP_STATUS_CREATED = 201;
const HTTP_STATUS_BAD_REQUEST = 400;
const HTTP_STATUS_UNAUTHORIZED = 401;

interface JwtPayload {
  readonly id: string;
}

interface MailTmAddress {
  readonly address: string;
  readonly name: string;
}

interface MailTmAttachment {
  readonly contentType: string;
  readonly filename: string;
  readonly id: string;
}

interface MailTmMessage {
  readonly createdAt: string;
  readonly downloadUrl: string;
  readonly from: MailTmAddress;
  readonly hasAttachments: boolean;
  readonly id: string;
  readonly seen: boolean;
  readonly size: number;
  readonly subject: string;
  readonly to: MailTmAddress[];
  readonly updatedAt: string;
}

interface MailTmMessageFull extends MailTmMessage {
  readonly attachments?: MailTmAttachment[];
  // Not guaranteed present: a mail from Epson Scan to Cloud came back with no `html` and crashed the note creator (#8).
  readonly cc?: MailTmAddress[];
  readonly html?: string[];
  readonly text?: string;
}

interface MailTmMessagesResponse {
  readonly 'hydra:member': MailTmMessage[];
}

interface MailTmProviderComponentConstructorParams {
  readonly app: App;
  readonly mailTmDomainManager: MailTmDomainManager;
  readonly pluginId: string;
  readonly pluginSettingsComponent: PluginSettingsComponent;
}

interface MailTmProviderComponentCreateAccountParams {
  readonly address: string;
  readonly password: string;
}

interface MailTmTokenResponse {
  readonly token: string;
}

export class MailTmProviderComponent extends ComponentEx implements EmailProvider {
  /**
   * Whether Mail.tm rejected the password saved on this device the last time it was asked for a token.
   *
   * The settings tab locks a password field that already holds a password, and before this a wrong one could only be
   * escaped by unregistering, which threw the mailbox away (#10). While this is set the field stays editable.
   *
   * @returns Whether the saved password was rejected.
   */
  public get isPasswordRejected(): boolean {
    return this._isPasswordRejected;
  }

  private _isPasswordRejected = false;
  private readonly app: App;
  private readonly mailTmDomainManager: MailTmDomainManager;
  private readonly pluginId: string;
  private readonly pluginSettingsComponent: PluginSettingsComponent;

  public constructor(params: MailTmProviderComponentConstructorParams) {
    super();
    this.app = params.app;
    this.mailTmDomainManager = params.mailTmDomainManager;
    this.pluginId = params.pluginId;
    this.pluginSettingsComponent = params.pluginSettingsComponent;
  }

  public async deleteMessage(messageId: string): Promise<void> {
    const token = await this.getToken();
    await requestUrl({
      headers: { Authorization: `Bearer ${token}` },
      method: 'DELETE',
      url: `${MAIL_TM_API_BASE_URL}/messages/${messageId}`
    });
  }

  // eslint-disable-next-line typescript-dev-toolkit/params-options-name-match -- Implements the shared EmailProvider interface contract, so the parameter object type is shared across all providers.
  public async downloadAttachment(params: EmailProviderDownloadAttachmentParams): Promise<ArrayBuffer> {
    const { attachmentId, messageId } = params;
    const token = await this.getToken();
    const response = await requestUrl({
      headers: { Authorization: `Bearer ${token}` },
      method: 'GET',
      url: `${MAIL_TM_API_BASE_URL}/messages/${messageId}/attachment/${attachmentId}`
    });
    return response.arrayBuffer;
  }

  public async getMessage(messageId: string): Promise<EmailMessageFull> {
    const token = await this.getToken();
    const response = await requestUrl({
      headers: { Authorization: `Bearer ${token}` },
      method: 'GET',
      url: `${MAIL_TM_API_BASE_URL}/messages/${messageId}`
    });
    const raw = response.json as MailTmMessageFull;
    return mapMailTmMessageFull(raw);
  }

  public async getMessages(): Promise<EmailMessageSummary[]> {
    const token = await this.getToken();
    const response = await requestUrl({
      headers: { Authorization: `Bearer ${token}` },
      method: 'GET',
      url: `${MAIL_TM_API_BASE_URL}/messages`
    });
    const data = response.json as MailTmMessagesResponse;
    return data['hydra:member'].map((message) => mapMailTmMessage(message));
  }

  public async markMessageAsSeen(messageId: string): Promise<void> {
    const token = await this.getToken();
    await requestUrl({
      body: JSON.stringify({ seen: true }),
      contentType: 'application/merge-patch+json',
      headers: { Authorization: `Bearer ${token}` },
      method: 'PATCH',
      url: `${MAIL_TM_API_BASE_URL}/messages/${messageId}`
    });
  }

  public async registerRandomEmailAddress(): Promise<void> {
    const domain = await this.mailTmDomainManager.getAvailableDomain();
    const EMAIL_ADDRESS_PREFIX = this.pluginId;
    const username = generateUsername();
    const address = `${EMAIL_ADDRESS_PREFIX}-${username}@${domain}`;
    const password = generatePassword();

    await this.createAccount({ address, password });

    const emailPasswordSecretKey = `${EMAIL_ADDRESS_PREFIX}-password`;
    this.app.secretStorage.setSecret(emailPasswordSecretKey, password);

    await this.pluginSettingsComponent.editAndSave((settings) => {
      settings.emailAddress = address;
      settings.emailPasswordSecretKey = emailPasswordSecretKey;
    });
  }

  /**
   * Deletes the mailbox on Mail.tm and forgets it on this device.
   *
   * When this device has no password for the address, or Mail.tm rejects the one it has, the mailbox cannot be
   * deleted on the server; it is still forgotten here, because otherwise the user could never leave that state (#10).
   *
   * @returns Whether the mailbox was deleted on the server too.
   */
  public async unregisterEmailAddress(): Promise<boolean> {
    const token = await this.tryGetToken();
    if (token !== null) {
      const accountId = extractAccountIdFromToken(token);
      await requestUrl({
        headers: { Authorization: `Bearer ${token}` },
        method: 'DELETE',
        url: `${MAIL_TM_API_BASE_URL}/accounts/${accountId}`
      });
    }

    const secretKey = this.pluginSettingsComponent.settings.emailPasswordSecretKey;
    if (secretKey) {
      this.app.secretStorage.setSecret(secretKey, '');
    }

    await this.pluginSettingsComponent.editAndSave((settings) => {
      settings.emailAddress = '';
      settings.emailPasswordSecretKey = '';
    });

    return token !== null;
  }

  private async createAccount(params: MailTmProviderComponentCreateAccountParams): Promise<void> {
    const response = await requestUrl({
      body: JSON.stringify({
        address: params.address,
        password: params.password
      }),
      contentType: 'application/json',
      method: 'POST',
      url: `${MAIL_TM_API_BASE_URL}/accounts`
    });

    if (response.status !== HTTP_STATUS_CREATED) {
      throw new Error(`Failed to create Mail.tm account: ${String(response.status)}`);
    }
  }

  private async getToken(): Promise<string> {
    const address = this.pluginSettingsComponent.settings.emailAddress;
    const password = this.app.secretStorage.getSecret(this.pluginSettingsComponent.settings.emailPasswordSecretKey);

    if (!address) {
      throw new EmailProviderAuthenticationError('No mail.tm email address is configured. Register one in the plugin settings.');
    }

    if (!password) {
      throw new EmailProviderAuthenticationError(
        `No password for ${address} is saved on this device. Copy it from the device the address was registered on, and paste it into the "Email password" field in the plugin settings.`
      );
    }

    const token = await this.tryGetToken();
    if (token === null) {
      throw new EmailProviderAuthenticationError(
        `mail.tm did not accept the password saved on this device for ${address}. Paste the right password into the "Email password" field in the plugin settings.`
      );
    }

    return token;
  }

  // Unlike `getToken`, a missing password or one Mail.tm rejects is an answer here rather than an error.
  private async tryGetToken(): Promise<null | string> {
    const address = this.pluginSettingsComponent.settings.emailAddress;
    const password = this.app.secretStorage.getSecret(this.pluginSettingsComponent.settings.emailPasswordSecretKey);

    if (!address || !password) {
      return null;
    }

    const response = await requestUrl({
      body: JSON.stringify({ address, password }),
      contentType: 'application/json',
      method: 'POST',
      throw: false,
      url: `${MAIL_TM_API_BASE_URL}/token`
    });

    if (response.status === HTTP_STATUS_UNAUTHORIZED) {
      this._isPasswordRejected = true;
      return null;
    }

    if (response.status >= HTTP_STATUS_BAD_REQUEST) {
      throw new Error(`Failed to get Mail.tm token: ${String(response.status)}`);
    }

    this._isPasswordRejected = false;
    const data = response.json as MailTmTokenResponse;
    return data.token;
  }
}

function extractAccountIdFromToken(token: string): string {
  const [, encodedPayload = ''] = token.split('.', JWT_HEADER_AND_PAYLOAD_PART_COUNT);
  const payload = JSON.parse(atob(encodedPayload)) as JwtPayload;
  return payload.id;
}

function mapMailTmMessage(message: MailTmMessage): EmailMessageSummary {
  return {
    createdAt: message.createdAt,
    from: message.from,
    hasAttachments: message.hasAttachments,
    id: message.id,
    seen: message.seen,
    subject: message.subject,
    to: message.to
  };
}

function mapMailTmMessageFull(message: MailTmMessageFull): EmailMessageFull {
  return {
    attachments: message.attachments ?? [],
    cc: message.cc ?? [],
    createdAt: message.createdAt,
    from: message.from,
    hasAttachments: message.hasAttachments,
    html: message.html ?? [],
    id: message.id,
    seen: message.seen,
    subject: message.subject,
    text: message.text ?? '',
    to: message.to
  };
}
