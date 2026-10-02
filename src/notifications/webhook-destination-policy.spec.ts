import { WebhookDestinationPolicy } from './webhook-destination-policy';

describe('WebhookDestinationPolicy', () => {
  const originalCidrs = process.env.WEBHOOK_ALLOWED_PRIVATE_CIDRS;
  const originalPorts = process.env.WEBHOOK_ALLOWED_PORTS;
  afterEach(() => {
    if (originalCidrs === undefined) delete process.env.WEBHOOK_ALLOWED_PRIVATE_CIDRS;
    else process.env.WEBHOOK_ALLOWED_PRIVATE_CIDRS = originalCidrs;
    if (originalPorts === undefined) delete process.env.WEBHOOK_ALLOWED_PORTS;
    else process.env.WEBHOOK_ALLOWED_PORTS = originalPorts;
  });

  it('requires HTTPS on the supported port and rejects URL credentials', async () => {
    const policy = new WebhookDestinationPolicy();
    await expect(policy.resolve('http://example.com/hook')).rejects.toThrow('must use HTTPS');
    await expect(policy.resolve('https://user:pass@example.com/hook')).rejects.toThrow('must use HTTPS');
    await expect(policy.resolve('https://example.com:8443/hook')).rejects.toThrow('approved port');
  });

  it('rejects loopback and private destinations unless their exact CIDR is configured', async () => {
    delete process.env.WEBHOOK_ALLOWED_PRIVATE_CIDRS;
    const blockedPolicy = new WebhookDestinationPolicy();
    await expect(blockedPolicy.resolve('https://127.0.0.1/hook')).rejects.toThrow('disallowed address');
    await expect(blockedPolicy.resolve('https://169.254.169.254/latest/meta-data/')).rejects.toThrow('disallowed address');

    process.env.WEBHOOK_ALLOWED_PRIVATE_CIDRS = '10.24.0.0/16';
    const allowedPolicy = new WebhookDestinationPolicy();
    await expect(allowedPolicy.resolve('https://10.24.3.9/hook')).resolves.toMatchObject({ address: '10.24.3.9', family: 4 });
    await expect(allowedPolicy.resolve('https://10.25.3.9/hook')).rejects.toThrow('disallowed address');
  });

  it('accepts a public HTTPS destination', async () => {
    const policy = new WebhookDestinationPolicy();
    await expect(policy.resolve('https://1.1.1.1/hook')).resolves.toMatchObject({ address: '1.1.1.1', family: 4 });
  });
});
