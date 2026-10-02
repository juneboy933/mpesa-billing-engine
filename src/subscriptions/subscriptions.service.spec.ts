import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlansService } from '../plans/plans.service';
import { PaymentsService } from '../payments/payments.service';
import { SubscriptionsService } from './subscriptions.service';

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;
  let prisma: {
    subscription: {
      create: jest.Mock;
      count: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
  };
  let plansService: { findById: jest.Mock };
  let paymentsService: { getReceipts: jest.Mock; getReceiptById: jest.Mock; triggerSTkPush: jest.Mock };
  let notificationsService: { send: jest.Mock };

  beforeEach(async () => {
    prisma = {
      subscription: {
        create: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };

    plansService = { findById: jest.fn() };
    paymentsService = { getReceipts: jest.fn(), getReceiptById: jest.fn(), triggerSTkPush: jest.fn() };
    notificationsService = { send: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: PlansService, useValue: plansService },
        { provide: PaymentsService, useValue: paymentsService },
        { provide: NotificationsService, useValue: notificationsService },
      ],
    }).compile();

    service = module.get<SubscriptionsService>(SubscriptionsService);
  });

  it('creates a subscription with a normalized phone and the plan id', async () => {
    const createdSubscription = {
      id: 'sub_1',
      customerPhone: '254712345678',
      nextBillingDate: new Date('2024-01-01T00:00:00.000Z'),
      status: 'ACTIVE',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
    };
    plansService.findById.mockResolvedValue({ id: 'plan_1', amount: 1200, name: 'Gold' });
    prisma.subscription.create.mockResolvedValue(createdSubscription);

    const result = await service.createSubscription('merchant_1', {
      planId: 'plan_1',
      customerPhone: '0712345678',
    });

    expect(plansService.findById).toHaveBeenCalledWith('merchant_1', 'plan_1');
    expect(prisma.subscription.create).toHaveBeenCalledWith({
      data: {
        merchantId: 'merchant_1',
        planId: 'plan_1',
        customerPhone: '254712345678',
        nextBillingDate: expect.any(Date),
      },
      select: {
        id: true,
        customerPhone: true,
        nextBillingDate: true,
        status: true,
        createdAt: true,
      },
    });
    expect(result).toEqual({
      message: 'Subscription created successfully',
      data: createdSubscription,
    });
  });

  it('returns a merchant subscription management overview with plan details', async () => {
    const subscriptions = [
      {
        id: 'sub_1',
        customerPhone: '254712345678',
        nextBillingDate: new Date('2026-10-01T00:00:00.000Z'),
        status: 'ACTIVE',
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
        plan: { id: 'plan_1', name: 'Gold', amount: 1200 },
      },
    ];
    prisma.subscription.findMany.mockResolvedValue(subscriptions);
    prisma.subscription.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);

    const result = await service.getManagementOverview('merchant_1');

    expect(result.totalSubscriptions).toBe(1);
    expect(result.activeSubscriptions).toBe(1);
    expect(result).toMatchObject({ page: 1, pageSize: 20, totalPages: 1 });
    expect(result.subscriptions[0]).toMatchObject({
      id: 'sub_1',
      customerPhone: '254712345678',
      status: 'ACTIVE',
      plan: { name: 'Gold', amount: 1200 },
    });
  });

  it('uses 20-row pages and clamps a page beyond the final result page', async () => {
    prisma.subscription.count.mockResolvedValueOnce(25).mockResolvedValueOnce(12);
    prisma.subscription.findMany.mockResolvedValue([]);

    const result = await service.getManagementOverview('merchant_1', 99);

    expect(result).toMatchObject({ totalSubscriptions: 25, activeSubscriptions: 12, page: 2, pageSize: 20, totalPages: 2 });
    expect(prisma.subscription.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 20 }));
  });

  it('throws when the merchant subscription cannot be found', async () => {
    prisma.subscription.findFirst.mockResolvedValue(null);

    await expect(service.getSubscriptionById('merchant_1', 'missing_sub')).rejects.toThrow(NotFoundException);
  });

  it('returns a merchant retry queue with overdue and retrying subscriptions grouped by status', async () => {
    const subscriptions = [
      {
        id: 'sub_1',
        customerPhone: '254712345678',
        nextBillingDate: new Date('2026-09-22T00:00:00.000Z'),
        status: 'RETRYING',
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
        plan: { id: 'plan_1', name: 'Gold', amount: 1200 },
      },
      {
        id: 'sub_2',
        customerPhone: '254712345679',
        nextBillingDate: new Date('2026-09-18T00:00:00.000Z'),
        status: 'PAST_DUE',
        createdAt: new Date('2026-08-20T00:00:00.000Z'),
        plan: { id: 'plan_2', name: 'Starter', amount: 500 },
      },
    ];

    prisma.subscription.findMany.mockResolvedValue(subscriptions);

    const result = await service.getRetryQueue('merchant_1');

    expect(prisma.subscription.findMany).toHaveBeenCalledWith({
      where: {
        merchantId: 'merchant_1',
        status: { in: ['RETRYING', 'PAST_DUE'] },
      },
      orderBy: { nextBillingDate: 'asc' },
      select: {
        id: true,
        customerPhone: true,
        status: true,
        nextBillingDate: true,
        createdAt: true,
        plan: { select: { id: true, name: true, amount: true } },
      },
    });
    expect(result.total).toBe(2);
    expect(result.retrying).toBe(1);
    expect(result.pastDue).toBe(1);
    expect(result.subscriptions[0]).toMatchObject({ id: 'sub_2', status: 'PAST_DUE' });
  });

  it('triggers an immediate retry for a failed subscription in the dunning queue', async () => {
    prisma.subscription.findFirst.mockResolvedValue({ id: 'sub_1', merchantId: 'merchant_1' });
    paymentsService.triggerSTkPush.mockResolvedValue({ message: 'Retry payment request sent' });

    const result = await service.triggerRetry('merchant_1', 'sub_1');

    expect(prisma.subscription.findFirst).toHaveBeenCalledWith({
      where: { id: 'sub_1', merchantId: 'merchant_1' },
      select: { id: true },
    });
    expect(paymentsService.triggerSTkPush).toHaveBeenCalledWith('sub_1');
    expect(result).toEqual({ message: 'Retry payment request sent' });
  });

  it('returns a customer billing portal view with recent payment activity', async () => {
    prisma.subscription.findFirst.mockResolvedValue({
      id: 'sub_1',
      merchantId: 'merchant_1',
      customerPhone: '254712345678',
      status: 'ACTIVE',
      nextBillingDate: new Date('2026-10-01T00:00:00.000Z'),
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      plan: { id: 'plan_1', name: 'Gold', amount: 1200 },
      paymentAttempts: [
        { id: 'attempt_1', status: 'SUCCEEDED', amount: 1200, createdAt: new Date('2026-09-15T00:00:00.000Z') },
        { id: 'attempt_2', status: 'FAILED', amount: 1200, createdAt: new Date('2026-09-20T00:00:00.000Z') },
      ],
    });

    const result = await service.getCustomerPortal('merchant_1', 'sub_1');

    expect(result).toMatchObject({
      subscriptionId: 'sub_1',
      customerPhone: '254712345678',
      status: 'ACTIVE',
      nextBillingDate: new Date('2026-10-01T00:00:00.000Z'),
      currentPlan: { id: 'plan_1', name: 'Gold', amount: 1200 },
      recentPayments: [
        expect.objectContaining({ id: 'attempt_1', status: 'SUCCEEDED', amount: 1200 }),
        expect.objectContaining({ id: 'attempt_2', status: 'FAILED', amount: 1200 }),
      ],
    });
  });

  it('triggers a payment request for the customer billing portal', async () => {
    prisma.subscription.findFirst.mockResolvedValue({
      id: 'sub_1',
      merchantId: 'merchant_1',
      customerPhone: '254712345678',
      status: 'ACTIVE',
      nextBillingDate: new Date('2026-10-01T00:00:00.000Z'),
      plan: { id: 'plan_1', name: 'Gold', amount: 1200 },
    });
    paymentsService.triggerSTkPush.mockResolvedValue({ message: 'Payment request sent' });

    const result = await service.payNow('merchant_1', 'sub_1');

    expect(paymentsService.triggerSTkPush).toHaveBeenCalledWith('sub_1');
    expect(result).toEqual({ message: 'Payment request sent', subscriptionId: 'sub_1' });
  });

  it('cancels a subscription and sends the cancellation notification', async () => {
    const cancelledSubscription = {
      id: 'sub_1',
      customerPhone: '254712345678',
      nextBillingDate: new Date('2024-01-01T00:00:00.000Z'),
      status: 'CANCELLED',
      createdAt: new Date('2023-12-01T00:00:00.000Z'),
    };
    prisma.subscription.findFirst.mockResolvedValue({ id: 'sub_1', merchantId: 'merchant_1' });
    prisma.subscription.update.mockResolvedValue(cancelledSubscription);

    const result = await service.cancelSubscription('merchant_1', 'sub_1');

    expect(prisma.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub_1' },
      data: { status: 'CANCELLED' },
      select: {
        id: true,
        customerPhone: true,
        nextBillingDate: true,
        status: true,
        createdAt: true,
      },
    });
    expect(notificationsService.send).toHaveBeenCalledWith('merchant_1', 'subscription.cancelled', {
      subscriptionId: 'sub_1',
    });
    expect(result).toBe(cancelledSubscription);
  });
});
