import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PaymentAttemptStatus, SubscriptionStatus } from '../generated/prisma/enums';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { DarajaService } from './daraja/daraja.service';
import { PaymentsService } from './payments.service';
import { MpesaCredentialsService } from '../merchants/mpesa-credentials.service';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prisma: {
    paymentAttempt: {
      findMany: jest.Mock;
      update: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      findUnique: jest.Mock;
    };
    subscription: {
      findUnique: jest.Mock;
      update: jest.Mock;
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
        findFirst: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
      },
      subscription: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    daraja = { triggerStk: jest.fn() };
    notification = { send: jest.fn() };
    mpesaCredentials = { decrypt: jest.fn((value: string) => value) };

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

  it('creates a payment attempt and updates it to initiated when the STK push succeeds', async () => {
    const subscription = {
      id: 'sub_1',
      customerPhone: '0712345678',
      nextBillingDate: new Date('2024-01-01T00:00:00.000Z'),
      plan: {
        amount: { toNumber: () => 1200 },
        name: 'Gold',
      },
    };
    prisma.subscription.findUnique.mockResolvedValue(subscription);
    prisma.paymentAttempt.findFirst.mockResolvedValue(null);
    prisma.paymentAttempt.create.mockResolvedValue({ id: 'attempt_1' });
    daraja.triggerStk.mockResolvedValue({ CheckoutRequestID: 'ws_CO_123' });
    prisma.paymentAttempt.update.mockResolvedValue({ id: 'attempt_1' });

    await service.triggerSTkPush('sub_1');

    expect(prisma.paymentAttempt.create).toHaveBeenCalledWith({
      data: {
        subscriptionId: 'sub_1',
        idempotencyKey: `charge:sub_1:${subscription.nextBillingDate.toISOString()}`,
        status: PaymentAttemptStatus.SCHEDULED,
        amount: 1200,
        attemptNumber: 1,
      },
    });
    expect(daraja.triggerStk).toHaveBeenCalledWith({
      phone: '0712345678',
      amount: 1200,
      accountReference: 'Gold',
      transactionDec: 'Gold subscription',
    });
    expect(prisma.paymentAttempt.update).toHaveBeenCalledWith({
      where: { id: 'attempt_1' },
      data: { status: PaymentAttemptStatus.INITIATED, checkoutId: 'ws_CO_123' },
    });
  });

  it('converts a duplicate payment attempt into a conflict exception', async () => {
    prisma.subscription.findUnique.mockResolvedValue({
      id: 'sub_1',
      customerPhone: '0712345678',
      nextBillingDate: new Date('2024-01-01T00:00:00.000Z'),
      plan: { amount: { toNumber: () => 1200 }, name: 'Gold' },
    });
    prisma.paymentAttempt.findFirst.mockResolvedValue(null);
    prisma.paymentAttempt.create.mockRejectedValue(Object.assign(new Error('duplicate'), { code: 'P2002' }));

    await expect(service.triggerSTkPush('sub_1')).rejects.toThrow(ConflictException);
  });

  it('uses attemptNumber 1 when there is no prior payment attempt or the last one succeeded', async () => {
    prisma.subscription.findUnique.mockResolvedValue({
      id: 'sub_1',
      customerPhone: '0712345678',
      nextBillingDate: new Date('2024-01-01T00:00:00.000Z'),
      plan: { amount: { toNumber: () => 1200 }, name: 'Gold' },
    });
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
    prisma.subscription.findUnique.mockResolvedValue({
      id: 'sub_1',
      customerPhone: '0712345678',
      nextBillingDate: new Date('2024-01-01T00:00:00.000Z'),
      plan: { amount: { toNumber: () => 1200 }, name: 'Gold' },
    });
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
    const tx1 = { subscription: { update: jest.fn().mockResolvedValue(undefined) } };
    const tx4 = { subscription: { update: jest.fn().mockResolvedValue(undefined) } };

    await (service as any).advanceRetryOrPastDue(tx1, { id: 'attempt_1', attemptNumber: 1, subscriptionId: 'sub_1' });
    await (service as any).advanceRetryOrPastDue(tx4, { id: 'attempt_4', attemptNumber: 4, subscriptionId: 'sub_1' });

    expect(tx1.subscription.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'sub_1' },
      data: expect.objectContaining({ status: SubscriptionStatus.RETRYING }),
    }));
    const retryDate = tx1.subscription.update.mock.calls[0][0].data.nextBillingDate;
    expect(retryDate).toBeInstanceOf(Date);
    expect(retryDate.getTime() - Date.now()).toBeGreaterThan(0);

    expect(tx4.subscription.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'sub_1' },
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
    prisma.$transaction.mockImplementation(async (fn) => fn({
      paymentAttempt: { update: jest.fn().mockResolvedValue(undefined) },
      subscription: { update: jest.fn().mockResolvedValue(undefined) },
    }));

    const result = await service.processCallback({
      Body: {
        stkCallback: {
          CheckoutRequestID: 'ws_CO_123',
          ResultCode: 1032,
          ResultDesc: 'Customer cancelled',
        },
      },
    } as any);

    expect(result).toEqual({ received: true });
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
      },
    };
    prisma.paymentAttempt.findUnique.mockResolvedValue(attempt);
    prisma.$transaction.mockResolvedValue([undefined, undefined]);

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
    expect(result).toBeUndefined();
  });

  it('reconciles stale initiated attempts and notifies about the failure outcome', async () => {
    const attempt = {
      id: 'attempt_1',
      subscriptionId: 'sub_1',
      attemptNumber: 1,
      subscription: { merchantId: 'merchant_1' },
    };
    prisma.paymentAttempt.findMany.mockResolvedValue([attempt]);
    prisma.$transaction.mockImplementation(async (fn) => fn({
      paymentAttempt: { update: jest.fn().mockResolvedValue(undefined) },
      subscription: { update: jest.fn().mockResolvedValue(undefined) },
    }));

    await service.reconcileStuckAttempts();

    expect(prisma.paymentAttempt.findMany).toHaveBeenCalledWith({
      where: {
        status: PaymentAttemptStatus.INITIATED,
        createdAt: { lt: expect.any(Date) },
      },
      include: { subscription: true },
    });
    expect(notification.send).toHaveBeenCalledWith('merchant_1', 'payment.failed', {
      subscriptionId: 'sub_1',
      attemptNumber: 1,
      resultDesc: 'No response from customer',
    });
  });
});
