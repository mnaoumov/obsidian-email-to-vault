import type { App } from 'obsidian';

import { requestUrl } from 'obsidian';
import { ComponentEx } from 'obsidian-dev-utils/obsidian/components/component-ex';

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
import { MAIL_TM_API_BASE_URL } from './mail-tm-constants.ts';

// A JWT is `header.payload.signature`; only the first two parts are needed, and the limit keeps a
// Signature containing `.` from producing extra segments.
const JWT_HEADER_AND_PAYLOAD_PART_COUNT = 2;
const HTTP_STATUS_CREATED = 201;

interface JwtPayload {
  id: string;
}

interface MailTmAddress {
  address: string;
  name: string;
}

interface MailTmAttachment {
  contentType: string;
  filename: string;
  id: string;
}

interface MailTmMessage {
  createdAt: string;
  downloadUrl: string;
  from: MailTmAddress;
  hasAttachments: boolean;
  id: string;
  seen: boolean;
  size: number;
  subject: string;
  to: MailTmAddress[];
  updatedAt: string;
}

interface MailTmMessageFull extends MailTmMessage {
  attachments?: MailTmAttachment[];
  cc: MailTmAddress[];
  html: string[];
  text: string;
}

interface MailTmMessagesResponse {
  'hydra:member': MailTmMessage[];
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
  token: string;
}

export class MailTmProviderComponent extends ComponentEx implements EmailProvider {
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

  // eslint-disable-next-line obsidian-dev-utils/params-options-name-match -- Implements the shared EmailProvider interface contract, so the parameter object type is shared across all providers.
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

  public async unregisterEmailAddress(): Promise<void> {
    const token = await this.getToken();
    const accountId = extractAccountIdFromToken(token);
    await requestUrl({
      headers: { Authorization: `Bearer ${token}` },
      method: 'DELETE',
      url: `${MAIL_TM_API_BASE_URL}/accounts/${accountId}`
    });

    const secretKey = this.pluginSettingsComponent.settings.emailPasswordSecretKey;
    if (secretKey) {
      this.app.secretStorage.setSecret(secretKey, '');
    }

    await this.pluginSettingsComponent.editAndSave((settings) => {
      settings.emailAddress = '';
      settings.emailPasswordSecretKey = '';
    });
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
    const secretKey = this.pluginSettingsComponent.settings.emailPasswordSecretKey;
    const password = this.app.secretStorage.getSecret(secretKey);

    if (!address || !password) {
      throw new Error('Email address or password not configured');
    }

    const response = await requestUrl({
      body: JSON.stringify({ address, password }),
      contentType: 'application/json',
      method: 'POST',
      url: `${MAIL_TM_API_BASE_URL}/token`
    });

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
    cc: message.cc,
    createdAt: message.createdAt,
    from: message.from,
    hasAttachments: message.hasAttachments,
    html: message.html,
    id: message.id,
    seen: message.seen,
    subject: message.subject,
    text: message.text,
    to: message.to
  };
}
