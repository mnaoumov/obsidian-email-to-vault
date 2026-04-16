import type { App } from 'obsidian';

import { requestUrl } from 'obsidian';

import type { Plugin } from './plugin.ts';

import { MAIL_TM_API_BASE_URL } from './mail-tm-constants.ts';
import {
  generatePassword,
  generateUsername
} from './string-generators.ts';

const HTTP_STATUS_CREATED = 201;

export interface MailTmAddress {
  address: string;
  name: string;
}

export interface MailTmAttachment {
  contentType: string;
  filename: string;
  id: string;
}

export interface MailTmMessage {
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

export interface MailTmMessageFull extends MailTmMessage {
  attachments?: MailTmAttachment[];
  cc: MailTmAddress[];
  html: string[];
  text: string;
}

interface CreateAccountParams {
  address: string;
  password: string;
}

interface JwtPayload {
  id: string;
}

interface MailTmDomain {
  domain: string;
  isActive: boolean;
}

interface MailTmDomainsResponse {
  'hydra:member': MailTmDomain[];
}

interface MailTmMessagesResponse {
  'hydra:member': MailTmMessage[];
}

interface MailTmTokenResponse {
  token: string;
}

export class MailTmManager {
  private readonly app: App;

  public constructor(private readonly plugin: Plugin) {
    this.app = plugin.app;
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

  public async getMessage(messageId: string): Promise<MailTmMessageFull> {
    const token = await this.getToken();
    const response = await requestUrl({
      headers: { Authorization: `Bearer ${token}` },
      method: 'GET',
      url: `${MAIL_TM_API_BASE_URL}/messages/${messageId}`
    });
    return response.json as MailTmMessageFull;
  }

  public async getMessages(): Promise<MailTmMessage[]> {
    const token = await this.getToken();
    const response = await requestUrl({
      headers: { Authorization: `Bearer ${token}` },
      method: 'GET',
      url: `${MAIL_TM_API_BASE_URL}/messages`
    });
    const data = response.json as MailTmMessagesResponse;
    return data['hydra:member'];
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
    const domain = await this.getAvailableDomain();
    const EMAIL_ADDRESS_PREFIX = this.plugin.manifest.id;
    const username = generateUsername();
    const address = `${EMAIL_ADDRESS_PREFIX}-${username}@${domain}`;
    const password = generatePassword();

    await this.createAccount({ address, password });

    const emailPasswordSecretKey = `${EMAIL_ADDRESS_PREFIX}-password`;
    this.app.secretStorage.setSecret(emailPasswordSecretKey, password);

    await this.plugin.settingsManager.editAndSave((settings) => {
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

    const secretKey = this.plugin.settings.emailPasswordSecretKey;
    if (secretKey) {
      this.app.secretStorage.setSecret(secretKey, '');
    }

    await this.plugin.settingsManager.editAndSave((settings) => {
      settings.emailAddress = '';
      settings.emailPasswordSecretKey = '';
    });
  }

  public async validateEmailDomain(address: string): Promise<boolean> {
    const domainPart = address.split('@')[1];
    if (!domainPart) {
      return false;
    }

    const domains = await this.getAvailableDomains();
    return domains.some((d) => d.domain === domainPart && d.isActive);
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

  private async getAvailableDomain(): Promise<string> {
    const domains = await this.getAvailableDomains();
    const activeDomain = domains.find((d) => d.isActive);

    if (!activeDomain) {
      throw new Error('No active Mail.tm domains available');
    }

    return activeDomain.domain;
  }

  private async getAvailableDomains(): Promise<MailTmDomain[]> {
    const response = await requestUrl({
      method: 'GET',
      url: `${MAIL_TM_API_BASE_URL}/domains`
    });

    const data = response.json as MailTmDomainsResponse;
    return data['hydra:member'];
  }

  private async getToken(): Promise<string> {
    const address = this.plugin.settings.emailAddress;
    const secretKey = this.plugin.settings.emailPasswordSecretKey;
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
