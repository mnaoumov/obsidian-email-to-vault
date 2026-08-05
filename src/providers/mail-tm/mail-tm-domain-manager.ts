import { requestUrl } from 'obsidian';

import { MAIL_TM_API_BASE_URL } from './mail-tm-constants.ts';

interface MailTmDomain {
  domain: string;
  isActive: boolean;
}

interface MailTmDomainsResponse {
  'hydra:member': MailTmDomain[];
}
// `split` is given a limit so a local part containing `@` cannot yield extra segments.
const ADDRESS_PART_COUNT = 2;

export class MailTmDomainManager {
  public async getAvailableDomain(): Promise<string> {
    const domains = await this.getAvailableDomains();
    const activeDomain = domains.find((d) => d.isActive);

    if (!activeDomain) {
      throw new Error('No active Mail.tm domains available');
    }

    return activeDomain.domain;
  }

  public async validateEmailDomain(address: string): Promise<boolean> {
    const domainPart = address.split('@', ADDRESS_PART_COUNT)[1];
    if (!domainPart) {
      return false;
    }

    const domains = await this.getAvailableDomains();
    return domains.some((d) => d.domain === domainPart && d.isActive);
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
