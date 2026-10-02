import { ConflictException, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { SubscriptionStatus } from '../generated/prisma/enums';
import { MemberPortalService } from './member-portal.service';

describe('MemberPortalService', () => {
  const now = new Date('2026-10-02T12:00:00.000Z');
  let service: MemberPortalService;
  let prisma: any;
  let config: any;
  let notifications: any;
  let payments: any;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    prisma = {
      subscription: { findFirst: jest.fn() },
      memberPortalToken: {
        create: jest.fn().mockResolvedValue({ id: 'token-record-1' }),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    config = { get: jest.fn(() => 'https://niaflow.example') };
    notifications = { queueSms: jest.fn().mockResolvedValue({ queued: true }) };
    payments = { triggerSTkPush: jest.fn().mockResolvedValue(undefined) };
    service = new MemberPortalService(prisma, config, notifications, payments);
  });

  afterEach(() => jest.useRealTimers());

  it('stores only a hash and queues a 24-hour member link by SMS', async () => {
    prisma.subscription.findFirst.mockResolvedValue({
      id: 'sub_1',
      customerPhone: '254712345678',
      plan: { name: 'Gold', amount: 1200, interval: 'MONTHLY' },
      merchant: { name: 'Northstar Fitness' },
    });

    const result = await service.issueLinkAndSendSms('merchant_1', 'sub_1');
    const { tokenHash, expiresAt, subscriptionId } = prisma.memberPortalToken.create.mock.calls[0][0].data;
    const [message, phone, deduplicationId] = notifications.queueSms.mock.calls[0];
    const url = message.match(/https:\/\/niaflow\.example\/member\/([\w-]+)/)?.[0];
    const rawToken = url?.split('/').pop();

    expect(rawToken).toBeDefined();
    expect(tokenHash).toBe(createHash('sha256').update(rawToken!).digest('hex'));
    expect(tokenHash).not.toBe(rawToken);
    expect(expiresAt).toEqual(new Date(now.getTime() + 24 * 60 * 60 * 1000));
    expect(subscriptionId).toBe('sub_1');
    expect(phone).toBe('254712345678');
    expect(deduplicationId).toBe('member-link:token-record-1');
    expect(message).toContain('KES 1,200 per month');
    expect(result).toEqual({ message: 'Member link queued for SMS', expiresAt });
  });

  it('rejects expired, revoked, malformed, and unknown member tokens', async () => {
    await expect(service.getPortal('x')).rejects.toThrow(NotFoundException);

    prisma.memberPortalToken.findUnique.mockResolvedValueOnce(null);
    await expect(service.getPortal('x'.repeat(43))).rejects.toThrow(NotFoundException);

    prisma.memberPortalToken.findUnique.mockResolvedValueOnce({
      revokedAt: now,
      expiresAt: new Date(now.getTime() + 1000),
    });
    await expect(service.getPortal('x'.repeat(43))).rejects.toThrow(NotFoundException);

    prisma.memberPortalToken.findUnique.mockResolvedValueOnce({
      revokedAt: null,
      expiresAt: now,
    });
    await expect(service.getPortal('x'.repeat(43))).rejects.toThrow(NotFoundException);
  });

  it('does not allow a cancelled subscription to be charged from its member link', async () => {
    prisma.memberPortalToken.findUnique.mockResolvedValue({
      revokedAt: null,
      expiresAt: new Date(now.getTime() + 1000),
      subscription: { id: 'sub_1', status: SubscriptionStatus.CANCELLED },
    });

    await expect(service.payNow('x'.repeat(43))).rejects.toThrow(ConflictException);
    expect(payments.triggerSTkPush).not.toHaveBeenCalled();
  });

  it('returns schedule and recent payment attempts without exposing the member phone', async () => {
    prisma.memberPortalToken.findUnique.mockResolvedValue({
      revokedAt: null,
      expiresAt: new Date(now.getTime() + 1000),
      subscription: {
        id: 'sub_1',
        status: SubscriptionStatus.ACTIVE,
        nextBillingDate: new Date('2026-10-09T00:00:00.000Z'),
        merchant: { name: 'Northstar Fitness' },
        plan: { name: 'Gold', amount: 1200, interval: 'WEEKLY' },
        paymentAttempts: [{
          id: 'attempt_1',
          status: 'SUCCEEDED',
          amount: 1200,
          createdAt: new Date('2026-10-02T00:00:00.000Z'),
          resolvedAt: new Date('2026-10-02T00:00:00.000Z'),
          mpesaReceiptNumber: 'QWE123ABC',
          mpesaTransactionDate: new Date('2026-10-02T00:00:00.000Z'),
        }],
      },
    });

    const result = await service.getPortal('x'.repeat(43));

    expect(result).toMatchObject({
      businessName: 'Northstar Fitness',
      plan: { name: 'Gold', amount: 1200, interval: 'WEEKLY' },
      canPayNow: true,
      recentAttempts: [{ receiptNumber: 'QWE123ABC', status: 'SUCCEEDED' }],
    });
    expect(result).not.toHaveProperty('customerPhone');
  });

  it('routes a valid member pay-now request through the regular payment lifecycle', async () => {
    prisma.memberPortalToken.findUnique.mockResolvedValue({
      revokedAt: null,
      expiresAt: new Date(now.getTime() + 1000),
      subscription: { id: 'sub_1', status: SubscriptionStatus.PAST_DUE },
    });

    await expect(service.payNow('x'.repeat(43))).resolves.toEqual({
      message: 'M-Pesa payment request sent',
      subscriptionId: 'sub_1',
    });
    expect(payments.triggerSTkPush).toHaveBeenCalledWith('sub_1');
  });
});
