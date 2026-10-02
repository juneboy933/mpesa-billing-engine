import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PaymentAttemptStatus, SubscriptionStatus } from '../generated/prisma/enums';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { DarajaService, StkPushOutcomeUnknownError, StkPushRejectedError } from './daraja/daraja.service';
import { PaymentsService } from './payments.service';
import { MpesaCredentialsService } from '../merchants/mpesa-credentials.service';

const readySubscription = (overrides: Record<string, unknown> = {}) => ({
  id: 'sub_1',
  merchantId: 'merchant_1',
  status: SubscriptionStatus.ACTIVE,
  customerPhone: '0712345678',
  nextBillingDate: new Date('2024-01-01T00:00:00.000Z'),
  plan: { amount: { toNumber: () => 1200 }, name: 'Gold', interval: 'MONTHLY' },
  merchant: {
    mpesaSetupStatus: 'COMPLETED',
    mpesaConsumerKeyEncrypted: 'consumer-key',
    mpesaConsumerSecretEncrypted: 'consumer-secret',
    mpesaShortcode: '600123',
    mpesaPasskeyEncrypted: 'passkey',
  },
  ...overrides,
});

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prisma: {
    paymentAttempt: {
      findMany: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      findUnique: jest.Mock;
    };
    subscription: {
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    darajaCallback: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      upsert: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let daraja: { triggerStk: jest.Mock };
  let notification: { send: jest.Mock };
  let mpesaCredentials: { decrypt: jest.Mock };

  it('returns a receipt summary and recent payment history for a subscription', async () => {
    prisma.paymentAttempt.findMany.mockResolvedValue([
      {
        id: 'attempt_1',
        status: PaymentAttemptStatus.SUCCEEDED,
        amount: 1200,
        createdAt: new Date('2026-09-10T00:00:00.000Z'),
        resolvedAt: new Date('2026-09-10T00:00:00.000Z'),
        subscription: {
          id: 'sub_1',
          customerPhone: '254712345678',
          nextBillingDate: new Date('2026-10-10T00:00:00.000Z'),
          plan: { id: 'plan_1', name: 'Gold' },
        },
      },
      {
        id: 'attempt_2',
        status: PaymentAttemptStatus.FAILED,
        amount: 1200,
        createdAt: new Date('2026-09-20T00:00:00.000Z'),
        resolvedAt: new Date('2026-09-20T00:00:00.000Z'),
        subscription: {
          id: 'sub_1',
          customerPhone: '254712345678',
          nextBillingDate: new Date('2026-10-10T00:00:00.000Z'),
          plan: { id: 'plan_1', name: 'Gold' },
        },
      },
    ]);

    const result = await service.getReceipts('merchant_1', 'sub_1');

    expect(result).toMatchObject({
      subscriptionId: 'sub_1',
      customerPhone: '254712345678',
      currentPlan: 'Gold',
      totalPayments: 2,
      receipts: [
        expect.objectContaining({ id: 'attempt_1', status: PaymentAttemptStatus.SUCCEEDED, amount: 1200 }),
        expect.objectContaining({ id: 'attempt_2', status: PaymentAttemptStatus.FAILED, amount: 1200 }),
      ],
    });
  });

  it('returns a single receipt payload for a specific payment attempt', async () => {
    prisma.paymentAttempt.findFirst.mockResolvedValue({
      id: 'attempt_1',
      status: PaymentAttemptStatus.SUCCEEDED,
      amount: 1200,
      createdAt: new Date('2026-09-10T00:00:00.000Z'),
      resolvedAt: new Date('2026-09-10T00:00:00.000Z'),
      subscription: {
        id: 'sub_1',
        customerPhone: '254712345678',
        plan: { id: 'plan_1', name: 'Gold' },
      },
    });

    const result = await service.getReceiptById('merchant_1', 'sub_1', 'attempt_1');

    expect(result).toMatchObject({
      receiptId: 'attempt_1',
      subscriptionId: 'sub_1',
      customerPhone: '254712345678',
      planName: 'Gold',
      amount: 1200,
      status: PaymentAttemptStatus.SUCCEEDED,
    });
  });

  beforeEach(async () => {
    prisma = {
      paymentAttempt: {
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findFirst: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
      },
      subscription: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      darajaCallback: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn(),
    };
    daraja = { triggerStk: jest.fn() };
    notification = { send: jest.fn() };
    mpesaCredentials = { decrypt: jest.fn((value: string) => value) };
    prisma.$transaction.mockImplementation(async (callback) => callback({
      paymentAttempt: prisma.paymentAttempt,
      subscription: prisma.subscription,
      darajaCallback: prisma.darajaCallback,
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: DarajaService, useValue: daraja },
        { provide: NotificationsService, useValue: notification },
        { provide: MpesaCredentialsService, useValue: mpesaCredentials },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  it('throws a not found error when a subscription does not exist for STK triggering', async () => {
    prisma.subscription.findUnique.mockResolvedValue(null);

    await expect(service.triggerSTkPush('missing-subscription')).rejects.toThrow(NotFoundException);
  });

  it('does not create a charge for a cancelled subscription', async () => {
    prisma.subscription.findUnique.mockResolvedValue(readySubscription({ status: SubscriptionStatus.CANCELLED }));

    await expect(service.triggerSTkPush('sub_1')).rejects.toThrow('Cancelled subscriptions cannot be charged');

    expect(prisma.paymentAttempt.create).not.toHaveBeenCalled();
    expect(daraja.triggerStk).not.toHaveBeenCalled();
  });

  it('creates a payment attempt and updates it to initiated when the STK push succeeds', async () => {
    const subscription = readySubscription();
    prisma.subscription.findUnique.mockResolvedValue(subscription);
    prisma.paymentAttempt.findFirst.mockResolvedValue(null);
    prisma.paymentAttempt.create.mockResolvedValue({ id: 'attempt_1' });
    daraja.triggerStk.mockResolvedValue({ CheckoutRequestID: 'ws_CO_123' });
    prisma.paymentAttempt.update.mockResolvedValue({ id: 'attempt_1' });

    await service.triggerSTkPush('sub_1');

    expect(prisma.paymentAttempt.create).toHaveBeenCalledWith({
      data: {
        subscriptionId: 'sub_1',
        idempotencyKey: `charge:sub_1:${subscription.nextBillingDate.toISOString()}:1`,
        status: PaymentAttemptStatus.SCHEDULED,
        amount: 1200,
        attemptNumber: 1,
      },
    });
    expect(daraja.triggerStk).toHaveBeenCalledWith(
      {
        phone: '0712345678',
        amount: 1200,
        accountReference: 'Gold',
        transactionDec: 'Gold subscription',
      },
      {
        consumerKey: 'consumer-key',
        consumerSecret: 'consumer-secret',
        shortcode: '600123',
        passkey: 'passkey',
      },
    );
    expect(prisma.paymentAttempt.updateMany).toHaveBeenCalledWith({
      where: { id: 'attempt_1', status: PaymentAttemptStatus.INITIATED },
      data: { checkoutId: 'ws_CO_123' },
    });
  });

  it('converts a duplicate payment attempt into a conflict exception', async () => {
    prisma.subscription.findUnique.mockResolvedValue(readySubscription());
    prisma.paymentAttempt.findFirst.mockResolvedValue(null);
    prisma.paymentAttempt.create.mockRejectedValue(Object.assign(new Error('duplicate'), { code: 'P2002' }));

    await expect(service.triggerSTkPush('sub_1')).rejects.toThrow(ConflictException);
  });

  it('schedules a retry after a definitive provider rejection', async () => {
    prisma.subscription.findUnique.mockResolvedValue(readySubscription());
    prisma.paymentAttempt.create.mockResolvedValue({ id: 'attempt_1', attemptNumber: 1, subscriptionId: 'sub_1' });
    daraja.triggerStk.mockRejectedValue(new StkPushRejectedError('Rejected'));

    await expect(service.triggerSTkPush('sub_1')).rejects.toThrow('Rejected');

    expect(prisma.paymentAttempt.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'attempt_1', status: PaymentAttemptStatus.INITIATED },
      data: { status: PaymentAttemptStatus.FAILED, resolvedAt: expect.any(Date) },
    }));
    expect(prisma.subscription.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: SubscriptionStatus.RETRYING, nextBillingDate: expect.any(Date) }),
    }));
  });

  it('holds an ambiguous provider result without scheduling another charge', async () => {
    prisma.subscription.findUnique.mockResolvedValue(readySubscription());
    prisma.paymentAttempt.create.mockResolvedValue({ id: 'attempt_1', attemptNumber: 1, subscriptionId: 'sub_1' });
    daraja.triggerStk.mockRejectedValue(new StkPushOutcomeUnknownError());

    await expect(service.triggerSTkPush('sub_1')).rejects.toThrow(StkPushOutcomeUnknownError);

    expect(prisma.paymentAttempt.updateMany).toHaveBeenCalledWith({
      where: { id: 'attempt_1', status: PaymentAttemptStatus.INITIATED },
      data: { status: PaymentAttemptStatus.PENDING_CONFIRMATION },
    });
    expect(prisma.subscription.updateMany).toHaveBeenCalledTimes(2);
    expect(notification.send).toHaveBeenCalledWith('merchant_1', 'payment.pending_confirmation', {
      paymentAttemptId: 'attempt_1',
      subscriptionId: 'sub_1',
      attemptNumber: 1,
      resolutionRequired: true,
    });
  });

  it('uses attemptNumber 1 when there is no prior payment attempt or the last one succeeded', async () => {
    prisma.subscription.findUnique.mockResolvedValue(readySubscription());
    prisma.paymentAttempt.findFirst.mockResolvedValue({ status: PaymentAttemptStatus.SUCCEEDED, attemptNumber: 3 });
    prisma.paymentAttempt.create.mockResolvedValue({ id: 'attempt_1' });
    daraja.triggerStk.mockResolvedValue({ CheckoutRequestID: 'ws_CO_123' });
    prisma.paymentAttempt.update.mockResolvedValue({ id: 'attempt_1' });

    await service.triggerSTkPush('sub_1');

    expect(prisma.paymentAttempt.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ attemptNumber: 1 }),
    }));
  });

  it('increments from the last failed or timed out attempt instead of resetting to 1', async () => {
    prisma.subscription.findUnique.mockResolvedValue(readySubscription());
    prisma.paymentAttempt.findFirst.mockResolvedValue({ status: PaymentAttemptStatus.FAILED, attemptNumber: 4 });
    prisma.paymentAttempt.create.mockResolvedValue({ id: 'attempt_2' });
    daraja.triggerStk.mockResolvedValue({ CheckoutRequestID: 'ws_CO_456' });
    prisma.paymentAttempt.update.mockResolvedValue({ id: 'attempt_2' });

    await service.triggerSTkPush('sub_1');

    expect(prisma.paymentAttempt.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ attemptNumber: 5 }),
    }));
  });

  it('schedules a retry for the first retry cycle and only marks past due after the ladder ends', async () => {
    const tx1 = { subscription: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    const tx4 = { subscription: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };

    await (service as any).advanceRetryOrPastDue(tx1, { id: 'attempt_1', attemptNumber: 1, subscriptionId: 'sub_1' });
    await (service as any).advanceRetryOrPastDue(tx4, { id: 'attempt_4', attemptNumber: 4, subscriptionId: 'sub_1' });

    expect(tx1.subscription.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'sub_1', status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.RETRYING, SubscriptionStatus.PAST_DUE] } },
      data: expect.objectContaining({ status: SubscriptionStatus.RETRYING }),
    }));
    const retryDate = tx1.subscription.updateMany.mock.calls[0][0].data.nextBillingDate;
    expect(retryDate).toBeInstanceOf(Date);
    expect(retryDate.getTime() - Date.now()).toBeGreaterThan(0);

    expect(tx4.subscription.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'sub_1', status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.RETRYING, SubscriptionStatus.PAST_DUE] } },
      data: expect.objectContaining({ status: SubscriptionStatus.PAST_DUE }),
    }));
  });

  it('marks failed payment callbacks as retrying and notifies the merchant', async () => {
    const attempt = {
      id: 'attempt_1',
      attemptNumber: 1,
      subscriptionId: 'sub_1',
      subscription: {
        merchantId: 'merchant_1',
        nextBillingDate: new Date('2024-01-01T00:00:00.000Z'),
      },
    };
    prisma.paymentAttempt.findUnique.mockResolvedValue(attempt);

    const result = await service.processCallback({
      Body: {
        stkCallback: {
          CheckoutRequestID: 'ws_CO_123',
          ResultCode: 1032,
          ResultDesc: 'Customer cancelled',
        },
      },
    } as any);

    expect(result).toEqual({ received: true, duplicate: false });
    expect(notification.send).toHaveBeenCalledWith('merchant_1', 'payment.failed', {
      subscriptionId: 'sub_1',
      attemptNumber: 1,
      resultDesc: 'Customer cancelled',
    });
  });

  it('marks successful payment callbacks active and updates the next billing date', async () => {
    const attempt = {
      id: 'attempt_1',
      attemptNumber: 1,
      subscriptionId: 'sub_1',
      amount: 1200,
      subscription: {
        merchantId: 'merchant_1',
        nextBillingDate: new Date('2024-01-01T00:00:00.000Z'),
        plan: { interval: 'MONTHLY' },
      },
    };
    prisma.paymentAttempt.findUnique.mockResolvedValue(attempt);

    const result = await service.processCallback({
      Body: {
        stkCallback: {
          CheckoutRequestID: 'ws_CO_123',
          ResultCode: 0,
          ResultDesc: 'The service request is processed successfully.',
        },
      },
    } as any);

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(notification.send).toHaveBeenCalledWith('merchant_1', 'payment.succeeded', {
      subscriptionId: 'sub_1',
      attemptNumber: 1,
      amount: 1200,
    });
    expect(result).toEqual({ received: true });
  });

  it('records a late successful callback without reactivating a cancelled subscription', async () => {
    prisma.paymentAttempt.findUnique.mockResolvedValue({
      id: 'attempt_1',
      attemptNumber: 1,
      subscriptionId: 'sub_1',
      amount: 1200,
      subscription: {
        merchantId: 'merchant_1',
        status: SubscriptionStatus.CANCELLED,
        nextBillingDate: new Date('2024-01-31T00:00:00.000Z'),
        plan: { interval: 'MONTHLY' },
      },
    });
    prisma.subscription.updateMany.mockResolvedValue({ count: 0 });

    await service.processCallback({
      Body: { stkCallback: { CheckoutRequestID: 'ws_CO_123', ResultCode: 0, ResultDesc: 'Success' } },
    } as any);

    expect(prisma.paymentAttempt.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: PaymentAttemptStatus.SUCCEEDED, resolvedAt: expect.any(Date) },
    }));
    expect(prisma.subscription.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'sub_1', status: { not: SubscriptionStatus.CANCELLED } },
    }));
    expect(notification.send).toHaveBeenCalledWith('merchant_1', 'payment.succeeded', expect.any(Object));
  });

  it('ignores a duplicate successful callback after its attempt is already resolved', async () => {
    prisma.paymentAttempt.findUnique.mockResolvedValue({
      id: 'attempt_1',
      attemptNumber: 1,
      subscriptionId: 'sub_1',
      amount: 1200,
      subscription: {
        merchantId: 'merchant_1',
        nextBillingDate: new Date('2024-01-31T00:00:00.000Z'),
        plan: { interval: 'MONTHLY' },
      },
    });
    prisma.paymentAttempt.updateMany.mockResolvedValue({ count: 0 });

    const result = await service.processCallback({
      Body: { stkCallback: { CheckoutRequestID: 'ws_CO_123', ResultCode: 0, ResultDesc: 'Success' } },
    } as any);

    expect(result).toEqual({ received: true, duplicate: true });
    expect(prisma.subscription.updateMany).not.toHaveBeenCalled();
    expect(notification.send).not.toHaveBeenCalled();
  });

  it('buffers a callback that arrives before the STK response stores its checkout ID', async () => {
    prisma.paymentAttempt.findUnique.mockResolvedValue(null);
    prisma.darajaCallback.upsert.mockResolvedValue({ checkoutId: 'ws_CO_early' });
    const callback = {
      Body: { stkCallback: { CheckoutRequestID: 'ws_CO_early', ResultCode: 0, ResultDesc: 'Success' } },
    };

    const result = await service.processCallback(callback as any);

    expect(result).toEqual({ received: true, pending: true });
    expect(prisma.darajaCallback.upsert).toHaveBeenCalledWith({
      where: { checkoutId: 'ws_CO_early' },
      create: { checkoutId: 'ws_CO_early', payload: callback },
      update: {},
    });
  });

  it('advances weekly billing by seven days and clamps month ends', () => {
    const weekly = (service as any).addInterval(new Date('2026-10-02T09:30:00.000Z'), 'WEEKLY');
    const monthly = (service as any).addInterval(new Date('2025-01-31T09:30:00.000Z'), 'MONTHLY');

    expect(weekly.toISOString()).toBe('2026-10-09T09:30:00.000Z');
    expect(monthly.toISOString()).toBe('2025-02-28T09:30:00.000Z');
  });

  it('holds stale initiated attempts for confirmation instead of risking a duplicate charge', async () => {
    const attempt = {
      id: 'attempt_1',
      subscriptionId: 'sub_1',
      attemptNumber: 1,
      subscription: { merchantId: 'merchant_1' },
    };
    prisma.paymentAttempt.findMany.mockResolvedValue([attempt]);
    prisma.paymentAttempt.updateMany.mockResolvedValue({ count: 1 });

    await service.reconcileStuckAttempts();

    expect(prisma.paymentAttempt.findMany).toHaveBeenCalledWith({
      where: {
        status: PaymentAttemptStatus.INITIATED,
        createdAt: { lt: expect.any(Date) },
      },
      include: { subscription: true },
    });
    expect(prisma.paymentAttempt.updateMany).toHaveBeenCalledWith({
      where: { id: 'attempt_1', status: PaymentAttemptStatus.INITIATED },
      data: { status: PaymentAttemptStatus.PENDING_CONFIRMATION },
    });
    expect(notification.send).toHaveBeenCalledWith('merchant_1', 'payment.pending_confirmation', expect.any(Object));
  });
});
