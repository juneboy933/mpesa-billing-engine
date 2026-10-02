import * as crypto from 'crypto';
import axios from 'axios';
import { Test, TestingModule } from '@nestjs/testing';
import { WebhookDeliveryProcessor } from './webhook-delivery.processor';
import { PrismaService } from '../prisma/prisma.service';
import { MerchantsService } from '../merchants/merchants.service';
import { WebhookDeliveryStatus } from '../generated/prisma/enums';
import { WebhookDestinationPolicy } from './webhook-destination-policy';

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
  },
}));

describe('WebhookDeliveryProcessor', () => {
  let processor: WebhookDeliveryProcessor;
  let prisma: {
    webhookDelivery: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let merchantsService: { findWebhookConfig: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();

    prisma = {
      webhookDelivery: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    merchantsService = { findWebhookConfig: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookDeliveryProcessor,
        { provide: PrismaService, useValue: prisma },
        { provide: MerchantsService, useValue: merchantsService },
        { provide: WebhookDestinationPolicy, useValue: { resolve: jest.fn().mockResolvedValue({ url: new URL('https://example.com/webhook'), address: '93.184.216.34', family: 4 }) } },
      ],
    }).compile();

    processor = module.get<WebhookDeliveryProcessor>(WebhookDeliveryProcessor);
  });

  it('computes a valid HMAC signature over the raw payload and updates the delivery as delivered', async () => {
    const payload = { hello: 'world', count: 2 };
    const merchantSecret = 'whsec_test_secret';
    const job = {
      data: { deliveryId: 'delivery_1' },
      attemptsMade: 0,
      opts: { attempts: 5 },
    } as any;
    const delivery = {
      id: 'delivery_1',
      merchantId: 'merchant_1',
      eventType: 'payment.succeeded',
      payload,
      status: WebhookDeliveryStatus.PENDING,
    };
    prisma.webhookDelivery.findUnique.mockResolvedValue(delivery);
    merchantsService.findWebhookConfig.mockResolvedValue({
      webhookUrl: 'https://example.com/webhook',
      webhookSecret: merchantSecret,
    });
    prisma.webhookDelivery.update.mockResolvedValue({ id: 'delivery_1' });
    (axios.post as jest.Mock).mockResolvedValue({ status: 200 });

    await expect(processor.process(job)).resolves.toBeUndefined();

    const expectedSignature = crypto
      .createHmac('sha256', merchantSecret)
      .update(JSON.stringify(payload))
      .digest('hex');

    expect(axios.post).toHaveBeenCalledWith(
      'https://example.com/webhook',
      payload,
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-Webhook-Signature': expectedSignature,
        }),
      }),
    );
    expect(axios.post).toHaveBeenCalledWith(
      'https://example.com/webhook', payload, expect.objectContaining({ maxRedirects: 0, proxy: false, httpsAgent: expect.anything() }),
    );
    expect(prisma.webhookDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'delivery_1' },
        data: expect.objectContaining({ status: WebhookDeliveryStatus.DELIVERED }),
      }),
    );
  });

  it('increments attempts and re-throws when a delivery fails so BullMQ can retry', async () => {
    const payload = { failure: true };
    const job = {
      data: { deliveryId: 'delivery_1' },
      attemptsMade: 1,
      opts: { attempts: 3 },
    } as any;
    prisma.webhookDelivery.findUnique.mockResolvedValue({
      id: 'delivery_1',
      merchantId: 'merchant_1',
      eventType: 'payment.failed',
      payload,
      status: WebhookDeliveryStatus.PENDING,
    });
    merchantsService.findWebhookConfig.mockResolvedValue({
      webhookUrl: 'https://example.com/webhook',
      webhookSecret: 'whsec_secret',
    });
    prisma.webhookDelivery.update.mockResolvedValue({ id: 'delivery_1' });
    (axios.post as jest.Mock).mockRejectedValue(new Error('network failure'));

    await expect(processor.process(job)).rejects.toThrow('network failure');
    expect(prisma.webhookDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'delivery_1' },
        data: expect.objectContaining({ attempts: { increment: 1 } }),
      }),
    );
  });
});
