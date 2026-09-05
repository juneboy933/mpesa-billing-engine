import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

const planSelect = {
    id: true,
    name: true,
    amount: true,
    interval: true,
    createdAt: true,
}

@Injectable()
export class PlansService {
    constructor(private readonly prisma: PrismaService) {}

    async create(merchantId: string, dto: CreatePlanDto) {
        return await this.prisma.plan.create({
            data: {
                name: dto.name.trim(),
                amount: dto.amount,
                merchantId
            },
            select: planSelect,
        })
    }

    async update(merchantId: string, planId: string, dto: UpdatePlanDto) {
        await this.findById(merchantId, planId);
        return await this.prisma.plan.update({
            where: { id: planId, merchantId },
            data: {
                name: dto.name?.trim(),
                amount: dto.amount
            },
            select: planSelect,
        });
    }

    async findAll(merchantId: string, skip = 0, take = 20) {
        return await this.prisma.plan.findMany({
            where: { merchantId}, 
            select: planSelect,
            skip,
            take,
        });
    }

    async findById(merchantId: string, planId: string) {
        const plan = await this.prisma.plan.findFirst({
            where: { id: planId, merchantId },
            select: planSelect,
        });

        if (!plan) {
            throw new NotFoundException('Plan not found');
        }

        return plan;
    }

    async delete(merchantId: string, planId: string) {
        const result = await this.prisma.plan.deleteMany({
            where: { id: planId, merchantId },
        });

        if (result.count === 0) {
            throw new NotFoundException('Plan not found');
        }

        return { message: 'Plan deleted successfully' };
    }

}
