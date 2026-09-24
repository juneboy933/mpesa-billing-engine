import { NotFoundException } from '@nestjs/common';
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
