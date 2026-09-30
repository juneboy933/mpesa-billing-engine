import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

describe('SubscriptionsController', () => {
  let controller: SubscriptionsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubscriptionsController],
      providers: [
        {
          provide: SubscriptionsService,
          useValue: {
            createSubscription: jest.fn(),
            getAllSubscriptions: jest.fn(),
            getSubscriptionById: jest.fn(),
            getCustomerPortal: jest.fn(),
            payNow: jest.fn(),
            cancelSubscription: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<SubscriptionsController>(SubscriptionsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns the customer billing portal for a subscription', async () => {
    const req = { merchant: { id: 'merchant_1' } } as any;
    const portal = { id: 'sub_1', customerPhone: '254712345678', status: 'ACTIVE', nextBillingDate: new Date() };
    (controller as any).subscriptionsService.getCustomerPortal = jest.fn().mockResolvedValue(portal);

    const result = await controller.getCustomerPortal(req, 'sub_1');

    expect((controller as any).subscriptionsService.getCustomerPortal).toHaveBeenCalledWith('merchant_1', 'sub_1');
    expect(result).toBe(portal);
  });

  it('triggers a pay-now charge for the subscription', async () => {
    const req = { merchant: { id: 'merchant_1' } } as any;
    const payment = { message: 'Payment initiated', subscriptionId: 'sub_1' };
    (controller as any).subscriptionsService.payNow = jest.fn().mockResolvedValue(payment);

    const result = await controller.payNow(req, 'sub_1');

    expect((controller as any).subscriptionsService.payNow).toHaveBeenCalledWith('merchant_1', 'sub_1');
    expect(result).toBe(payment);
  });
});
