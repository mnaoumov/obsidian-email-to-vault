import type { App } from 'obsidian';

import {
  Component,
  requestUrl
} from 'obsidian';

import type { PluginSettingsComponent } from '../../plugin-settings-component.ts';
import type {
  EmailMessageFull,
  EmailMessageSummary
} from '../email-provider-types.ts';
import type { EmailProvider } from '../email-provider.ts';
import type { MailTmDomainManager } from './mail-tm-domain-manager.ts';

import {
  generatePassword,
  generateUsername
} from '../../string-generators.ts';
import { MAIL_TM_API_BASE_URL } from './mail-tm-constants.ts';

const HTTP_STATUS_CREATED = 201;

interface CreateAccountParams {
  readonly address: string;
  readonly password: string;
}

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

interface MailTmTokenResponse {
  token: string;
}

export class MailTmProviderComponent extends Component implements EmailProvider {
  public constructor(
    private readonly app: App,
    private readonly pluginId: string,
    private readonly pluginSettingsComponent: PluginSettingsComponent,
    private readonly mailTmDomainManager: MailTmDomainManager
  ) {
    super();
  }

  public async deleteMessage(messageId: string): Promise<void> {
    const token = await this.getToken();
    await requestUrl({
      headers: { Authorization: `Bearer ${token}` },
      method: 'DELETE',
      url: `${MAIL_TM_API_BASE_URL}/messages/${messageId}`
    });
  }

  public async downloadAttachment(messageId: string, attachmentId: string): Promise<ArrayBuffer> {
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
    return data['hydra:member'].map(mapMailTmMessage);
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

  private async createAccount(params: CreateAccountParams): Promise<void> {
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
  const [, encodedPayload = ''] = token.split('.');
  const payload = JSON.parse(atob(encodedPayload)) as JwtPayload;
  return payload.id;
}

function mapMailTmMessage(msg: MailTmMessage): EmailMessageSummary {
  return {
    createdAt: msg.createdAt,
    from: msg.from,
    hasAttachments: msg.hasAttachments,
    id: msg.id,
    seen: msg.seen,
    subject: msg.subject,
    to: msg.to
  };
}

function mapMailTmMessageFull(msg: MailTmMessageFull): EmailMessageFull {
  return {
    attachments: msg.attachments ?? [],
    cc: msg.cc,
    createdAt: msg.createdAt,
    from: msg.from,
    hasAttachments: msg.hasAttachments,
    html: msg.html,
    id: msg.id,
    seen: msg.seen,
    subject: msg.subject,
    text: msg.text,
    to: msg.to
  };
}
