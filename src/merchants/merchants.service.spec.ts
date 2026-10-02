import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { MerchantsService } from './merchants.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import { UpdateMerchantDto } from './dto/update-merchant.dto';
import { DarajaService } from '../payments/daraja/daraja.service';
import { MpesaCredentialsService } from './mpesa-credentials.service';

jest.mock('argon2');
jest.mock('crypto');

describe('MerchantsService', () => {
  let service: MerchantsService;
  let darajaService: { validateCredentials: jest.Mock };
  let mpesaCredentialsService: { encrypt: jest.Mock };
  let prisma: {
    $transaction: jest.Mock;
    merchant: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
    subscription: {
      count: jest.Mock;
      findMany: jest.Mock;
    };
    paymentAttempt: {
      count: jest.Mock;
      findMany: jest.Mock;
    };
    plan: {
      count: jest.Mock;
      create: jest.Mock;
    };
  };

  const mockedArgon2 = argon2 as jest.Mocked<typeof argon2>;
  const mockedCrypto = crypto as jest.Mocked<typeof crypto>;

  const HEX_A = 'a'.repeat(64);
  const HEX_B = 'b'.repeat(64);

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(),
      merchant: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      subscription: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
      paymentAttempt: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
      plan: {
        count: jest.fn(),
        create: jest.fn(),
      },
    };

    darajaService = { validateCredentials: jest.fn() };
    mpesaCredentialsService = { encrypt: jest.fn(() => 'opaque-ciphertext') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerchantsService,
        { provide: PrismaService, useValue: prisma },
        { provide: DarajaService, useValue: darajaService },
        { provide: MpesaCredentialsService, useValue: mpesaCredentialsService },
      ],
    }).compile();

    service = module.get<MerchantsService>(MerchantsService);

    jest.clearAllMocks();

    // First randomBytes() call in a test returns HEX_A, second returns HEX_B, etc.
    let call = 0;
    const sequence = [HEX_A, HEX_B, 'c'.repeat(64)];
    (mockedCrypto.randomBytes as unknown as jest.Mock).mockImplementation(() => {
      const hex = sequence[call] ?? `${call}`.repeat(64);
      call += 1;
      return { toString: () => hex } as unknown as Buffer;
    });

    mockedArgon2.hash.mockResolvedValue('hashed-api-key');
  });

  describe('setupMpesa', () => {
    it('validates credentials before storing encrypted merchant PayBill configuration', async () => {
      const dto = {
        consumerKey: 'consumer-key',
        consumerSecret: 'consumer-secret',
        shortcode: '174379',
        passkey: 'passkey',
      };
      prisma.merchant.update.mockResolvedValue({
        id: 'm1',
        mpesaShortcode: dto.shortcode,
        mpesaSetupCompletedAt: new Date('2026-09-30T00:00:00.000Z'),
      });
      darajaService.validateCredentials.mockResolvedValue({ valid: true });

      const result = await service.setupMpesa('m1', dto);

      expect(darajaService.validateCredentials).toHaveBeenCalledWith(dto);
      expect(mpesaCredentialsService.encrypt).toHaveBeenCalledTimes(3);
      expect(prisma.merchant.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'm1' },
        data: expect.objectContaining({
          mpesaConsumerKeyEncrypted: 'opaque-ciphertext',
          mpesaConsumerSecretEncrypted: 'opaque-ciphertext',
          mpesaPasskeyEncrypted: 'opaque-ciphertext',
          mpesaShortcode: dto.shortcode,
          mpesaSetupCompletedAt: expect.any(Date),
        }),
      }));
      expect(result).toMatchObject({ merchantId: 'm1', status: 'COMPLETED', shortcode: dto.shortcode });
      expect(JSON.stringify(prisma.merchant.update.mock.calls[0][0])).not.toContain(dto.consumerSecret);
    });

    it('does not persist credentials when Daraja validation fails', async () => {
      darajaService.validateCredentials.mockResolvedValue({ valid: false, message: 'Invalid credentials' });

      await expect(service.setupMpesa('m1', {
        consumerKey: 'consumer-key',
        consumerSecret: 'consumer-secret',
        shortcode: '174379',
        passkey: 'passkey',
      })).rejects.toThrow('Invalid credentials');

      expect(prisma.merchant.update).not.toHaveBeenCalled();
    });
  });

  describe('guided onboarding', () => {
    it('starts onboarding with M-Pesa setup as the next required step', async () => {
      const created = {
        merchant: { id: 'm1', name: 'Gym', webhookUrl: null },
        webhookSecret: 'whsec_secret',
      };
      prisma.merchant.create.mockResolvedValue(created.merchant);

      const result = await service.startOnboarding({ name: 'Gym', phoneNumber: '0712345678', password: 'a-secure-test-password' });

      expect(result).toMatchObject({
        merchant: created.merchant,
        apiKey: expect.stringMatching(/^mk_/),
        onboarding: { status: 'MPESA_SETUP_REQUIRED', nextStep: 'MPESA_SETUP' },
      });
    });

    it('reports setup and first-plan progress without exposing credentials', async () => {
      prisma.merchant.findUnique.mockResolvedValue({
        id: 'm1',
        name: 'Gym',
        mpesaSetupStatus: 'COMPLETED',
        mpesaSetupCompletedAt: new Date('2026-09-30T00:00:00.000Z'),
        plans: [],
      });

      await expect(service.getOnboardingStatus('m1')).resolves.toEqual({
        merchantId: 'm1',
        businessName: 'Gym',
        mpesaSetup: { status: 'COMPLETED', completedAt: new Date('2026-09-30T00:00:00.000Z') },
        firstPlan: { status: 'REQUIRED' },
        nextStep: 'FIRST_PLAN',
      });
    });

    it('creates the first plan only after M-Pesa setup is complete', async () => {
      prisma.merchant.findUnique.mockResolvedValue({ id: 'm1', mpesaSetupStatus: 'COMPLETED' });
      const plan = { id: 'plan_1', name: 'Monthly Gym', amount: 1500, interval: 'MONTHLY', createdAt: new Date() };
      prisma.plan.create.mockResolvedValue(plan);

      await expect(service.completeOnboarding('m1', { name: 'Monthly Gym', amount: 1500 })).resolves.toEqual({
        status: 'COMPLETE',
        plan,
      });
    });

    it('rejects first-plan creation while M-Pesa setup is incomplete', async () => {
      prisma.merchant.findUnique.mockResolvedValue({ id: 'm1', mpesaSetupStatus: 'PENDING' });

      await expect(service.completeOnboarding('m1', { name: 'Monthly Gym', amount: 1500 }))
        .rejects.toThrow('Complete M-Pesa setup before creating a plan');
      expect(prisma.plan.create).not.toHaveBeenCalled();
    });
  });

  describe('getMpesaSetupStatus', () => {
    it('returns setup status without exposing encrypted credentials', async () => {
      prisma.merchant.findUnique.mockResolvedValue({
        id: 'm1',
        mpesaShortcode: '174379',
        mpesaSetupStatus: 'COMPLETED',
        mpesaSetupCompletedAt: new Date('2026-09-30T00:00:00.000Z'),
      });

      const result = await service.getMpesaSetupStatus('m1');

      expect(prisma.merchant.findUnique).toHaveBeenCalledWith({
        where: { id: 'm1' },
        select: { id: true, mpesaShortcode: true, mpesaSetupStatus: true, mpesaSetupCompletedAt: true },
      });
      expect(result).toEqual({
        merchantId: 'm1',
        status: 'COMPLETED',
        shortcode: '174379',
        completedAt: new Date('2026-09-30T00:00:00.000Z'),
      });
    });
  });

  describe('onboard', () => {
    it('creates the merchant and the first billing plan in one onboarding flow', async () => {
      const dto = {
        name: 'Acme Ltd',
        phoneNumber: '0712345678',
        password: 'a-secure-test-password',
        email: 'owner@example.com',
        webhookUrl: 'https://acme.example.com/webhooks',
        planName: 'Starter Monthly',
        planAmount: 500,
      };
      const createdMerchant = { id: 'm1', name: dto.name, webhookUrl: dto.webhookUrl };
      const createdPlan = { id: 'plan_1', name: dto.planName, amount: 500, interval: 'MONTHLY', createdAt: new Date() };

      prisma.$transaction.mockImplementation(async (callback) => callback({
        merchant: { create: jest.fn().mockResolvedValue(createdMerchant) },
        plan: { create: jest.fn().mockResolvedValue(createdPlan) },
      }));

      const result = await service.onboard(dto as any);

      expect(result.merchant).toBe(createdMerchant);
      expect(result.plan).toBe(createdPlan);
      expect(result.apiKey).toBe(`mk_${HEX_A.slice(0, 32)}_${HEX_B}`);
      expect(result.webhookSecret).toBe(`whsec_${'c'.repeat(64)}`);
    });
  });

  describe('create', () => {
    const dto: CreateMerchantDto = {
      name: 'Acme Ltd',
      phoneNumber: '0712345678',
      password: 'a-secure-test-password',
      email: 'owner@example.com',
      webhookUrl: 'https://acme.example.com/webhooks',
    };

    it('returns the created merchant with the raw api key and webhook secret', async () => {
      const createdMerchant = { id: 'm1', name: dto.name, webhookUrl: dto.webhookUrl };
      prisma.merchant.create.mockResolvedValue(createdMerchant);

      const result = await service.create(dto);

      expect(result.merchant).toBe(createdMerchant);
      expect(result.apiKey).toBe(`mk_${HEX_A.slice(0, 32)}_${HEX_B}`);
      expect(result.webhookSecret).toBe(`whsec_${'c'.repeat(64)}`);
    });

    it('hashes the raw api key with argon2 before persisting', async () => {
      prisma.merchant.create.mockResolvedValue({});

      await service.create(dto);

      expect(mockedArgon2.hash).toHaveBeenCalledWith(HEX_B);
    });

    it('persists only the hash, never the raw api key', async () => {
      prisma.merchant.create.mockResolvedValue({});

      await service.create(dto);

      const { data } = prisma.merchant.create.mock.calls[0][0];
      expect(data.apiKeyHash).toBe('hashed-api-key');
      expect(Object.values(data)).not.toContain(`mk_${HEX_A.slice(0, 32)}_${HEX_B}`);
    });

    it('calls prisma with the dto fields, hash, secret, and the public select', async () => {
      prisma.merchant.create.mockResolvedValue({});

      await service.create(dto);

      expect(prisma.merchant.create).toHaveBeenCalledWith({
        data: {
          name: dto.name,
          phoneNumber: '254712345678',
          email: dto.email,
          passwordHash: 'hashed-api-key',
          webhookUrl: dto.webhookUrl,
          apiKeyId: HEX_A.slice(0, 32),
          apiKeyHash: 'hashed-api-key',
          webhookSecret: `whsec_${'c'.repeat(64)}`,
        },
        select: { id: true, name: true, webhookUrl: true, createdAt: true },
      });
    });

    it('propagates a database error', async () => {
      const dbError = new Error('unique constraint failed on webhookUrl');
      prisma.merchant.create.mockRejectedValue(dbError);

      await expect(service.create(dto)).rejects.toThrow(dbError);
    });

    it('returns a conflict when the phone number is already registered', async () => {
      prisma.merchant.create.mockRejectedValue({
        code: 'P2002',
        meta: {
          driverAdapterError: {
            cause: { constraint: { index: 'Merchant_phoneNumber_key' } },
          },
        },
      });

      await expect(service.create({ ...dto, phoneNumber: '0712345678' }))
        .rejects.toThrow(ConflictException);
      await expect(service.create({ ...dto, phoneNumber: '0712345678' }))
        .rejects.toThrow('Sign in to continue');
    });

    it('propagates an argon2 hashing failure without creating a merchant', async () => {
      mockedArgon2.hash.mockRejectedValue(new Error('hashing failed'));

      await expect(service.create(dto)).rejects.toThrow('hashing failed');
      expect(prisma.merchant.create).not.toHaveBeenCalled();
    });
  });

  describe('getDashboard', () => {
    it('returns a summary of plans, subscriptions, and failed payments for the merchant', async () => {
      prisma.plan.count.mockResolvedValue(3);
      prisma.subscription.count.mockResolvedValue(7);
      prisma.paymentAttempt.count.mockResolvedValue(2);
      prisma.subscription.findMany.mockResolvedValue([
        {
          id: 'sub_1',
          customerPhone: '+254712345678',
          status: 'ACTIVE',
          nextBillingDate: new Date('2026-10-01T00:00:00.000Z'),
          createdAt: new Date('2026-09-01T00:00:00.000Z'),
          plan: { name: 'Starter', amount: 500 },
        },
      ]);

      const result = await service.getDashboard('m1');

      expect(prisma.plan.count).toHaveBeenCalledWith({ where: { merchantId: 'm1' } });
      expect(prisma.subscription.count).toHaveBeenCalledWith({ where: { merchantId: 'm1' } });
      expect(prisma.paymentAttempt.count).toHaveBeenCalledWith({
        where: {
          status: { in: ['FAILED', 'TIMED_OUT'] },
          subscription: { merchantId: 'm1' },
        },
      });
      expect(result.metrics.plansCount).toBe(3);
      expect(result.metrics.subscriptionsCount).toBe(7);
      expect(result.metrics.failedPaymentsCount).toBe(2);
      expect(result.recentSubscriptions).toHaveLength(1);
    });
  });

  describe('findById', () => {
    it('queries by id with the public select and returns the result', async () => {
      const merchant = { id: 'm1', name: 'Acme', webhookUrl: 'https://x.com', createdAt: new Date() };
      prisma.merchant.findUnique.mockResolvedValue(merchant);

      const result = await service.findById('m1');

      expect(prisma.merchant.findUnique).toHaveBeenCalledWith({
        where: { id: 'm1' },
        select: { id: true, name: true, webhookUrl: true, createdAt: true },
      });
      expect(result).toBe(merchant);
    });

    it('returns null when no merchant matches', async () => {
      prisma.merchant.findUnique.mockResolvedValue(null);

      const result = await service.findById('missing-id');

      expect(result).toBeNull();
    });
  });

  describe('findByApiKeyId and legacy authentication', () => {
    it('looks up one API key by its public ID', async () => {
      const merchant = { id: 'm1', name: 'Acme', apiKeyId: 'a'.repeat(32), apiKeyHash: 'h1' };
      prisma.merchant.findUnique.mockResolvedValue(merchant);

      const result = await service.findByApiKeyId('a'.repeat(32));

      expect(prisma.merchant.findUnique).toHaveBeenCalledWith({
        where: { apiKeyId: 'a'.repeat(32) },
        select: { id: true, name: true, apiKeyId: true, apiKeyHash: true },
      });
      expect(result).toBe(merchant);
    });

    it('limits compatibility lookup to merchants that have not rotated their legacy key', async () => {
      const merchants = [{ id: 'm1', name: 'Acme', apiKeyHash: 'h1' }];
      prisma.merchant.findMany.mockResolvedValue(merchants);

      const result = await service.findLegacyApiKeys();

      expect(prisma.merchant.findMany).toHaveBeenCalledWith({
        where: { apiKeyId: null },
        select: { id: true, name: true, apiKeyHash: true },
      });
      expect(result).toBe(merchants);
    });

    it('returns an empty array when there are no merchants', async () => {
      prisma.merchant.findMany.mockResolvedValue([]);

      const result = await service.findLegacyApiKeys();

      expect(result).toEqual([]);
    });
  });

  describe('rotateApiKey', () => {
    it('replaces the key ID and hash and returns the raw replacement once', async () => {
      prisma.merchant.update.mockResolvedValue({ id: 'm1' });

      const result = await service.rotateApiKey('m1');

      expect(result.apiKey).toMatch(/^mk_[a-f0-9]{32}_[a-f0-9]{64}$/);
      expect(prisma.merchant.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { apiKeyId: expect.any(String), apiKeyHash: 'hashed-api-key' },
        select: { id: true },
      });
    });
  });

  describe('findWebhookConfig', () => {
    it('queries by merchantId with the secrets select', async () => {
      const config = { id: 'm1', webhookUrl: 'https://x.com', webhookSecret: 'whsec_abc' };
      prisma.merchant.findUnique.mockResolvedValue(config);

      const result = await service.findWebhookConfig('m1');

      expect(prisma.merchant.findUnique).toHaveBeenCalledWith({
        where: { id: 'm1' },
        select: { id: true, webhookUrl: true, webhookSecret: true },
      });
      expect(result).toBe(config);
    });

    it('returns null when the merchant does not exist', async () => {
      prisma.merchant.findUnique.mockResolvedValue(null);

      const result = await service.findWebhookConfig('missing-id');

      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    const dto: UpdateMerchantDto = { webhookUrl: 'https://new.example.com/webhooks' };

    it('updates only the webhookUrl and returns the public fields', async () => {
      const updated = { id: 'm1', name: 'Acme', webhookUrl: dto.webhookUrl, updatedAt: new Date() };
      prisma.merchant.update.mockResolvedValue(updated);

      const result = await service.update('m1', dto);

      expect(prisma.merchant.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { webhookUrl: dto.webhookUrl },
        select: { id: true, name: true, webhookUrl: true, updatedAt: true },
      });
      expect(result).toBe(updated);
    });

    it('does not touch apiKeyHash or webhookSecret via update', async () => {
      prisma.merchant.update.mockResolvedValue({});

      await service.update('m1', dto);

      const { data } = prisma.merchant.update.mock.calls[0][0];
      expect(data).toEqual({ webhookUrl: dto.webhookUrl });
    });

    it('propagates an error when the merchant does not exist', async () => {
      const notFoundError = new Error('Record to update not found.');
      prisma.merchant.update.mockRejectedValue(notFoundError);

      await expect(service.update('missing-id', dto)).rejects.toThrow(notFoundError);
    });
  });

  describe('rotateWebhookSecret', () => {
    it('generates and persists a new webhook secret, returning it', async () => {
      prisma.merchant.update.mockResolvedValue({ id: 'm1' });

      const result = await service.rotateWebhookSecret('m1');

      expect(prisma.merchant.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { webhookSecret: `whsec_${HEX_A}` },
        select: { id: true },
      });
      expect(result).toEqual({ webhookSecret: `whsec_${HEX_A}` });
    });

    it('does not return anything beyond the new secret', async () => {
      prisma.merchant.update.mockResolvedValue({ id: 'm1' });

      const result = await service.rotateWebhookSecret('m1');

      expect(Object.keys(result)).toEqual(['webhookSecret']);
    });

    it('generates a different secret on each call', async () => {
      prisma.merchant.update.mockResolvedValue({ id: 'm1' });
      (mockedCrypto.randomBytes as unknown as jest.Mock)
        .mockReset()
        .mockImplementationOnce(() => ({ toString: () => HEX_A }))
        .mockImplementationOnce(() => ({ toString: () => HEX_B }));

      const first = await service.rotateWebhookSecret('m1');
      const second = await service.rotateWebhookSecret('m1');

      expect(first.webhookSecret).not.toBe(second.webhookSecret);
    });

    it('propagates an error when the merchant does not exist', async () => {
      const notFoundError = new Error('Record to update not found.');
      prisma.merchant.update.mockRejectedValue(notFoundError);

      await expect(service.rotateWebhookSecret('missing-id')).rejects.toThrow(notFoundError);
    });
  });

  describe('getAnalyticsSummary', () => {
    it('returns merchant revenue, active subscriptions, and recovery metrics', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-20T00:00:00.000Z'));
      prisma.subscription.findMany.mockResolvedValue([
        { id: 'sub_1', status: 'ACTIVE', plan: { amount: 1200 } },
        { id: 'sub_2', status: 'RETRYING', plan: { amount: 800 } },
        { id: 'sub_3', status: 'PAST_DUE', plan: { amount: 500 } },
      ]);
      prisma.paymentAttempt.findMany.mockResolvedValue([
        { status: 'SUCCEEDED', amount: 1200, createdAt: new Date('2026-09-01T00:00:00.000Z') },
        { status: 'SUCCEEDED', amount: 2000, createdAt: new Date('2026-09-05T00:00:00.000Z') },
        { status: 'FAILED', amount: 1200, createdAt: new Date('2026-09-10T00:00:00.000Z') },
      ]);

      const result = await service.getAnalyticsSummary('m1');

      expect(result).toMatchObject({
        totalSubscriptions: 3,
        activeSubscriptions: 1,
        monthlyRecurringRevenue: 1200,
        totalRevenue: 3200,
        collectedThisPeriod: 3200,
        failedPayments: 1,
        retryingSubscriptions: 2,
      });
      expect(result.revenueTrend).toHaveLength(7);
      expect(result.revenueTrend[0].date).toBeDefined();
      jest.useRealTimers();
    });
  });
});
