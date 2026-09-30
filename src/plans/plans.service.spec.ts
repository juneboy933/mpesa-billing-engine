import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { PlansService } from './plans.service';

describe('PlansService', () => {
  let service: PlansService;
  let prisma: {
    plan: {
      create: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      deleteMany: jest.Mock;
    };
    subscription: {
      findMany: jest.Mock;
    };
    merchant: {
      findUnique: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      plan: {
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        deleteMany: jest.fn(),
      },
      subscription: {
        findMany: jest.fn(),
      },
      merchant: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlansService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<PlansService>(PlansService);
  });

  it('creates a plan with the merchant id and trimmed name', async () => {
    const dto = { name: '  Gold Plan  ', amount: 1200 };
    const createdPlan = {
      id: 'plan_1',
      name: 'Gold Plan',
      amount: 1200,
      interval: 'MONTHLY',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
    };
    prisma.plan.create.mockResolvedValue(createdPlan);
    prisma.merchant.findUnique.mockResolvedValue({ id: 'merchant_1', mpesaSetupStatus: 'COMPLETED' });

    const result = await service.create('merchant_1', dto);

    expect(prisma.plan.create).toHaveBeenCalledWith({
      data: {
        name: 'Gold Plan',
        amount: 1200,
        merchantId: 'merchant_1',
      },
      select: {
        id: true,
        name: true,
        amount: true,
        interval: true,
        createdAt: true,
      },
    });
    expect(result).toBe(createdPlan);
  });

  it('rejects plan creation until the merchant completes M-Pesa setup', async () => {
    prisma.merchant.findUnique.mockResolvedValue({ id: 'merchant_1', mpesaSetupStatus: 'PENDING' });

    await expect(service.create('merchant_1', { name: 'Gold Plan', amount: 1200 }))
      .rejects.toThrow(BadRequestException);
    expect(prisma.plan.create).not.toHaveBeenCalled();
  });

  it('updates the plan when it belongs to the merchant', async () => {
    const dto = { name: '  Standard  ', amount: 3500 };
    const updatedPlan = {
      id: 'plan_1',
      name: 'Standard',
      amount: 3500,
      interval: 'MONTHLY',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
    };
    prisma.plan.findFirst.mockResolvedValue({ id: 'plan_1', merchantId: 'merchant_1' });
    prisma.plan.update.mockResolvedValue(updatedPlan);

    const result = await service.update('merchant_1', 'plan_1', dto);

    expect(prisma.plan.findFirst).toHaveBeenCalledWith({
      where: { id: 'plan_1', merchantId: 'merchant_1' },
      select: {
        id: true,
        name: true,
        amount: true,
        interval: true,
        createdAt: true,
      },
    });
    expect(prisma.plan.update).toHaveBeenCalledWith({
      where: { id: 'plan_1', merchantId: 'merchant_1' },
      data: { name: 'Standard', amount: 3500 },
      select: {
        id: true,
        name: true,
        amount: true,
        interval: true,
        createdAt: true,
      },
    });
    expect(result).toBe(updatedPlan);
  });

  it('returns plans for a merchant using pagination', async () => {
    const plans = [{ id: 'plan_1', name: 'Gold', amount: 1200, interval: 'MONTHLY', createdAt: new Date() }];
    prisma.plan.findMany.mockResolvedValue(plans);

    const result = await service.findAll('merchant_1', 2, 5);

    expect(prisma.plan.findMany).toHaveBeenCalledWith({
      where: { merchantId: 'merchant_1' },
      select: { id: true, name: true, amount: true, interval: true, createdAt: true },
      skip: 2,
      take: 5,
    });
    expect(result).toBe(plans);
  });

  it('returns a merchant plan management overview with subscription counts', async () => {
    const plans = [
      { id: 'plan_1', name: 'Gold', amount: 1200, interval: 'MONTHLY', createdAt: new Date() },
      { id: 'plan_2', name: 'Silver', amount: 800, interval: 'MONTHLY', createdAt: new Date() },
    ];
    prisma.plan.findMany.mockResolvedValue(plans);
    prisma.subscription.findMany.mockResolvedValue([
      { id: 'sub_1', planId: 'plan_1', status: 'ACTIVE' },
      { id: 'sub_2', planId: 'plan_1', status: 'RETRYING' },
      { id: 'sub_3', planId: 'plan_2', status: 'ACTIVE' },
    ]);

    const result = await service.getManagementOverview('merchant_1');

    expect(result.totalPlans).toBe(2);
    expect(result.totalActiveSubscriptions).toBe(2);
    expect(result.plans[0]).toMatchObject({
      id: 'plan_1',
      name: 'Gold',
      subscriptionCount: 2,
    });
    expect(result.plans[1]).toMatchObject({
      id: 'plan_2',
      name: 'Silver',
      subscriptionCount: 1,
    });
  });

  it('throws if a plan for the merchant does not exist', async () => {
    prisma.plan.findFirst.mockResolvedValue(null);

    await expect(service.findById('merchant_1', 'missing_plan')).rejects.toThrow(NotFoundException);
  });

  it('deletes a plan and returns the success message', async () => {
    prisma.plan.deleteMany.mockResolvedValue({ count: 1 });

    const result = await service.delete('merchant_1', 'plan_1');

    expect(result).toEqual({ message: 'Plan deleted successfully' });
    expect(prisma.plan.deleteMany).toHaveBeenCalledWith({
      where: { id: 'plan_1', merchantId: 'merchant_1' },
    });
  });

  it('throws when trying to delete a non-existent plan', async () => {
    prisma.plan.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.delete('merchant_1', 'missing_plan')).rejects.toThrow(NotFoundException);
  });
});
