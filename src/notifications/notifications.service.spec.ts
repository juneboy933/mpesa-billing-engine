import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { MerchantsService } from '../merchants/merchants.service';
import { WebhookDeliveryStatus } from '../generated/prisma/enums';
import { CradleVoicesService } from './cradle-voices.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: {
    webhookDelivery: { create: jest.Mock };
  };
  let queue: { add: jest.Mock };
  let merchantsService: { findWebhookConfig: jest.Mock };
  let cradleVoices: { sendSms: jest.Mock };

  beforeEach(async () => {
    prisma = {
      webhookDelivery: {
        create: jest.fn(),
      },
    };
    queue = { add: jest.fn() };
    merchantsService = { findWebhookConfig: jest.fn() };
    cradleVoices = { sendSms: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: MerchantsService, useValue: merchantsService },
        { provide: 'BullQueue_webhook-delivery', useValue: queue },
        { provide: CradleVoicesService, useValue: cradleVoices },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  it('no-ops when the merchant has no webhook configuration', async () => {
    merchantsService.findWebhookConfig.mockResolvedValue(null);

    await expect(service.send('merchant_1', 'payment.failed', { x: 1 })).resolves.toBeUndefined();
    expect(prisma.webhookDelivery.create).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('creates a pending delivery and enqueues it when the webhook is configured', async () => {
    merchantsService.findWebhookConfig.mockResolvedValue({
      id: 'merchant_1',
      webhookUrl: 'https://example.com/webhook',
      webhookSecret: 'whsec_123',
    });
    prisma.webhookDelivery.create.mockResolvedValue({ id: 'delivery_1' });

    await service.send('merchant_1', 'payment.succeeded', { subscriptionId: 'sub_1' });

    expect(prisma.webhookDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        merchantId: 'merchant_1',
        eventType: 'payment.succeeded',
        status: WebhookDeliveryStatus.PENDING,
      }),
    });
    expect(queue.add).toHaveBeenCalledWith(
      'deliver',
      { deliveryId: 'delivery_1' },
      { attempts: 5, backoff: { type: 'exponential', delay: 2000 } },
    );
  });

  it('delegates SMS delivery to the configured provider', async () => {
    cradleVoices.sendSms.mockResolvedValue({ accepted: true });

    await expect(service.sendSms('Your code is 482913.', ['254700000000']))
      .resolves.toEqual({ accepted: true });
    expect(cradleVoices.sendSms).toHaveBeenCalledWith('Your code is 482913.', ['254700000000']);
  });
});
