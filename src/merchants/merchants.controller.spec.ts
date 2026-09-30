import { Test, TestingModule } from '@nestjs/testing';
import { Request } from 'express';
import { MerchantsController } from './merchants.controller';
import { MerchantsService } from './merchants.service';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import { UpdateMerchantDto } from './dto/update-merchant.dto';

describe('MerchantsController', () => {
  let controller: MerchantsController;
  let merchantsService: {
    create: jest.Mock;
    onboard: jest.Mock;
    getDashboard: jest.Mock;
    setupMpesa: jest.Mock;
    getMpesaSetupStatus: jest.Mock;
    update: jest.Mock;
    rotateWebhookSecret: jest.Mock;
    getAnalyticsSummary: jest.Mock;
  };

  const mockRequest = (merchantId: string) =>
    ({ merchant: { id: merchantId } }) as unknown as Request & { merchant: { id: string } };

  beforeEach(async () => {
    merchantsService = {
      create: jest.fn(),
      onboard: jest.fn(),
      getDashboard: jest.fn(),
      setupMpesa: jest.fn(),
      getMpesaSetupStatus: jest.fn(),
      update: jest.fn(),
      rotateWebhookSecret: jest.fn(),
      getAnalyticsSummary: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MerchantsController],
      providers: [
        { provide: MerchantsService, useValue: merchantsService },
      ],
    }).compile();

    controller = module.get<MerchantsController>(MerchantsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    const dto: CreateMerchantDto = {
      name: 'Acme Ltd',
      webhookUrl: 'https://acme.example.com/webhooks',
    };

    it('delegates to merchantsService.create with the dto', async () => {
      const serviceResult = {
        merchant: { id: 'm1', name: dto.name, webhookUrl: dto.webhookUrl },
        apiKey: 'mk_rawkey',
        webhookSecret: 'whsec_rawsecret',
      };
      merchantsService.create.mockResolvedValue(serviceResult);

      const result = await controller.create(dto);

      expect(merchantsService.create).toHaveBeenCalledWith(dto);
      expect(result).toBe(serviceResult);
    });

    it('propagates a service error', async () => {
      const error = new Error('webhookUrl already in use');
      merchantsService.create.mockRejectedValue(error);

      await expect(controller.create(dto)).rejects.toThrow(error);
    });
  });

  describe('onboard', () => {
    const dto = {
      name: 'Acme Ltd',
      webhookUrl: 'https://acme.example.com/webhooks',
      planName: 'Starter Monthly',
      planAmount: 500,
    };

    it('delegates to merchantsService.onboard with the dto', async () => {
      const serviceResult = {
        merchant: { id: 'm1', name: dto.name, webhookUrl: dto.webhookUrl },
        plan: { id: 'plan_1', name: dto.planName, amount: dto.planAmount },
        apiKey: 'mk_rawkey',
        webhookSecret: 'whsec_rawsecret',
      };
      merchantsService.onboard.mockResolvedValue(serviceResult);

      const result = await controller.onboard(dto as any);

      expect(merchantsService.onboard).toHaveBeenCalledWith(dto);
      expect(result).toBe(serviceResult);
    });
  });

  describe('dashboard', () => {
    it('delegates to merchantsService.getDashboard with the authenticated merchant id', async () => {
      const req = mockRequest('m1');
      const dashboard = {
        merchantId: 'm1',
        metrics: { plansCount: 2, subscriptionsCount: 4, activeSubscriptionsCount: 3, failedPaymentsCount: 1 },
        recentSubscriptions: [],
      };
      merchantsService.getDashboard.mockResolvedValue(dashboard);

      const result = await controller.getDashboard(req);

      expect(merchantsService.getDashboard).toHaveBeenCalledWith('m1');
      expect(result).toBe(dashboard);
    });
  });

  describe('mpesa setup', () => {
    it('delegates setup and status calls using the authenticated merchant id', async () => {
      const req = mockRequest('m1');
      const dto = { consumerKey: 'key', consumerSecret: 'secret', shortcode: '174379', passkey: 'passkey' };
      const setup = { merchantId: 'm1', status: 'COMPLETED', shortcode: '174379' };
      const status = { merchantId: 'm1', status: 'COMPLETED', shortcode: '174379' };
      merchantsService.setupMpesa.mockResolvedValue(setup);
      merchantsService.getMpesaSetupStatus.mockResolvedValue(status);

      await expect(controller.setupMpesa(req, dto as any)).resolves.toBe(setup);
      await expect(controller.getMpesaSetupStatus(req)).resolves.toBe(status);
      expect(merchantsService.setupMpesa).toHaveBeenCalledWith('m1', dto);
      expect(merchantsService.getMpesaSetupStatus).toHaveBeenCalledWith('m1');
    });
  });

  describe('update', () => {
    const dto: UpdateMerchantDto = { webhookUrl: 'https://new.example.com/webhooks' };

    it('delegates to merchantsService.update with the authenticated merchant id and dto', async () => {
      const req = mockRequest('m1');
      const updated = { id: 'm1', name: 'Acme', webhookUrl: dto.webhookUrl, updatedAt: new Date() };
      merchantsService.update.mockResolvedValue(updated);

      const result = await controller.update(req, dto);

      expect(merchantsService.update).toHaveBeenCalledWith('m1', dto);
      expect(result).toBe(updated);
    });

    it('uses the merchant id from the request, not any id in the body', async () => {
      const req = mockRequest('authenticated-merchant-id');
      merchantsService.update.mockResolvedValue({});

      await controller.update(req, { ...dto, id: 'attacker-supplied-id' } as UpdateMerchantDto);

      expect(merchantsService.update).toHaveBeenCalledWith('authenticated-merchant-id', expect.anything());
    });

    it('propagates a service error', async () => {
      const req = mockRequest('m1');
      const error = new Error('Record to update not found.');
      merchantsService.update.mockRejectedValue(error);

      await expect(controller.update(req, dto)).rejects.toThrow(error);
    });
  });

  describe('rotateWebhookSecret', () => {
    it('delegates to merchantsService.rotateWebhookSecret with the authenticated merchant id', async () => {
      const req = mockRequest('m1');
      const serviceResult = { webhookSecret: 'whsec_newsecret' };
      merchantsService.rotateWebhookSecret.mockResolvedValue(serviceResult);

      const result = await controller.rotateWebhookSecret(req);

      expect(merchantsService.rotateWebhookSecret).toHaveBeenCalledWith('m1');
      expect(result).toBe(serviceResult);
    });

    it('propagates a service error', async () => {
      const req = mockRequest('m1');
      const error = new Error('Record to update not found.');
      merchantsService.rotateWebhookSecret.mockRejectedValue(error);

      await expect(controller.rotateWebhookSecret(req)).rejects.toThrow(error);
    });
  });

  describe('getAnalyticsSummary', () => {
    it('delegates to merchantsService.getAnalyticsSummary with the authenticated merchant id', async () => {
      const req = mockRequest('m1');
      const analytics = { totalSubscriptions: 3, activeSubscriptions: 1, totalRevenue: 3200, failedPayments: 1, revenueTrend: [] };
      merchantsService.getAnalyticsSummary.mockResolvedValue(analytics);

      const result = await controller.getAnalyticsSummary(req);

      expect(merchantsService.getAnalyticsSummary).toHaveBeenCalledWith('m1');
      expect(result).toBe(analytics);
    });
  });
});