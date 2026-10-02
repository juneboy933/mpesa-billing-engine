import { Injectable } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import * as ipaddr from 'ipaddr.js';

export type ResolvedWebhookDestination = {
  url: URL;
  address: string;
  family: number;
};

@Injectable()
export class WebhookDestinationPolicy {
  private readonly allowedPrivateCidrs: string[];
  private readonly allowedPorts: Set<string>;

  constructor() {
    this.allowedPrivateCidrs = (process.env.WEBHOOK_ALLOWED_PRIVATE_CIDRS ?? '')
      .split(',').map((cidr) => cidr.trim()).filter(Boolean);
    this.allowedPorts = new Set((process.env.WEBHOOK_ALLOWED_PORTS ?? '443').split(',').map((port) => port.trim()).filter(Boolean));
    for (const cidr of this.allowedPrivateCidrs) {
      try { ipaddr.parseCIDR(cidr); } catch { throw new Error(`Invalid WEBHOOK_ALLOWED_PRIVATE_CIDRS entry: ${cidr}`); }
    }
  }

  async resolve(rawUrl: string): Promise<ResolvedWebhookDestination> {
    let url: URL;
    try { url = new URL(rawUrl); } catch { throw new Error('Invalid webhook URL'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || !this.allowedPorts.has(url.port || '443')) {
      throw new Error('Webhook URL must use HTTPS on an approved port, without credentials or fragments');
    }

    const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
      throw new Error('Webhook hostname is not allowed');
    }
    const records = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await lookup(hostname, { all: true, verbatim: true });
    if (!records.length) throw new Error('Webhook hostname did not resolve');
    for (const record of records) {
      if (!this.isAllowed(record.address)) throw new Error('Webhook hostname resolves to a disallowed address');
    }
    return { url, address: records[0].address, family: records[0].family };
  }

  private isAllowed(rawAddress: string): boolean {
    let address: ipaddr.IPv4 | ipaddr.IPv6;
    try { address = ipaddr.process(rawAddress); } catch { return false; }
    const range = address.range();
    if (range === 'unicast') return true;
    if (['loopback', 'linkLocal', 'multicast', 'broadcast', 'unspecified', 'ipv4Mapped'].includes(range)) return false;
    return this.allowedPrivateCidrs.some((cidr) => {
      try {
        const parsed = ipaddr.parseCIDR(cidr);
        const [network] = parsed;
        return address.kind() === network.kind() && (address as any).match(parsed);
      } catch { return false; }
    });
  }
}
