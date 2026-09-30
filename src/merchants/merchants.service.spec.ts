import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { MerchantsService } from './merchants.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import { UpdateMerchantDto } from './dto/update-merchant.dto';

jest.mock('argon2');
jest.mock('crypto');

describe('MerchantsService', () => {
  let service: MerchantsService;
  let prisma: {
    $transaction: jest.Mock;
    merchant: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
    plan: {
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
      plan: {
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerchantsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<MerchantsService>(MerchantsService);

    jest.clearAllMocks();

    // First randomBytes() call in a test returns HEX_A, second returns HEX_B, etc.
    let call = 0;
    const sequence = [HEX_A, HEX_B];
    (mockedCrypto.randomBytes as unknown as jest.Mock).mockImplementation(() => {
      const hex = sequence[call] ?? `${call}`.repeat(64);
      call += 1;
      return { toString: () => hex } as unknown as Buffer;
    });

    mockedArgon2.hash.mockResolvedValue('hashed-api-key');
  });

  describe('onboard', () => {
    it('creates the merchant and the first billing plan in one onboarding flow', async () => {
      const dto = {
        name: 'Acme Ltd',
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
      expect(result.apiKey).toBe(`mk_${HEX_A}`);
      expect(result.webhookSecret).toBe(`whsec_${HEX_B}`);
    });
  });

  describe('create', () => {
    const dto: CreateMerchantDto = {
      name: 'Acme Ltd',
      webhookUrl: 'https://acme.example.com/webhooks',
    };

    it('returns the created merchant with the raw api key and webhook secret', async () => {
      const createdMerchant = { id: 'm1', name: dto.name, webhookUrl: dto.webhookUrl };
      prisma.merchant.create.mockResolvedValue(createdMerchant);

      const result = await service.create(dto);

      expect(result.merchant).toBe(createdMerchant);
      expect(result.apiKey).toBe(`mk_${HEX_A}`);
      expect(result.webhookSecret).toBe(`whsec_${HEX_B}`);
    });

    it('hashes the raw api key with argon2 before persisting', async () => {
      prisma.merchant.create.mockResolvedValue({});

      await service.create(dto);

      expect(mockedArgon2.hash).toHaveBeenCalledWith(`mk_${HEX_A}`);
    });

    it('persists only the hash, never the raw api key', async () => {
      prisma.merchant.create.mockResolvedValue({});

      await service.create(dto);

      const { data } = prisma.merchant.create.mock.calls[0][0];
      expect(data.apiKeyHash).toBe('hashed-api-key');
      expect(Object.values(data)).not.toContain(`mk_${HEX_A}`);
    });

    it('calls prisma with the dto fields, hash, secret, and the public select', async () => {
      prisma.merchant.create.mockResolvedValue({});

      await service.create(dto);

      expect(prisma.merchant.create).toHaveBeenCalledWith({
        data: {
          name: dto.name,
          webhookUrl: dto.webhookUrl,
          apiKeyHash: 'hashed-api-key',
          webhookSecret: `whsec_${HEX_B}`,
        },
        select: { id: true, name: true, webhookUrl: true, createdAt: true },
      });
    });

    it('propagates a database error', async () => {
      const dbError = new Error('unique constraint failed on webhookUrl');
      prisma.merchant.create.mockRejectedValue(dbError);

      await expect(service.create(dto)).rejects.toThrow(dbError);
    });

    it('propagates an argon2 hashing failure without creating a merchant', async () => {
      mockedArgon2.hash.mockRejectedValue(new Error('hashing failed'));

      await expect(service.create(dto)).rejects.toThrow('hashing failed');
      expect(prisma.merchant.create).not.toHaveBeenCalled();
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

  describe('findAllForAuth', () => {
    it('selects only id, name, and apiKeyHash', async () => {
      const merchants = [{ id: 'm1', name: 'Acme', apiKeyHash: 'h1' }];
      prisma.merchant.findMany.mockResolvedValue(merchants);

      const result = await service.findAllForAuth();

      expect(prisma.merchant.findMany).toHaveBeenCalledWith({
        select: { id: true, name: true, apiKeyHash: true },
      });
      expect(result).toBe(merchants);
    });

    it('returns an empty array when there are no merchants', async () => {
      prisma.merchant.findMany.mockResolvedValue([]);

      const result = await service.findAllForAuth();

      expect(result).toEqual([]);
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
});