import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PaymentsService } from '../payments.service';
import { WebhooksController } from './webhooks.controller';

describe('WebhooksController', () => {
  let controller: WebhooksController;
  let paymentsService: { processCallback: jest.Mock };

  beforeEach(async () => {
    paymentsService = { processCallback: jest.fn().mockResolvedValue(undefined) };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [
        {
          provide: PaymentsService,
          useValue: paymentsService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test-token'),
          },
        },
      ],
    }).compile();

    controller = module.get<WebhooksController>(WebhooksController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('acknowledges a callback without returning its URL token', async () => {
    const payload = { Body: { stkCallback: { CheckoutRequestID: 'co_1' } } } as any;

    await expect(controller.handleCallback(payload)).resolves.toEqual({ ResultCode: 0, ResultDesc: 'Accepted' });
    expect(paymentsService.processCallback).toHaveBeenCalledWith(payload);
  });
});
