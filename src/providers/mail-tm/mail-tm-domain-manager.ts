import { requestUrl } from 'obsidian';

import { MAIL_TM_API_BASE_URL } from './mail-tm-constants.ts';

interface MailTmDomain {
  readonly domain: string;
  readonly isActive: boolean;
}

interface MailTmDomainsResponse {
  readonly 'hydra:member': MailTmDomain[];
}

export class MailTmDomainManager {
  public async getAvailableDomain(): Promise<string> {
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
}
