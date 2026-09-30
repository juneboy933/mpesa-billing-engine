import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import * as crypto from 'crypto';
import * as argon2 from 'argon2';
import { UpdateMerchantDto } from './dto/update-merchant.dto';
import { PaymentAttemptStatus, SubscriptionStatus } from '../generated/prisma/enums';

const merchantSelect = {
    id: true,
    name: true, 
    webhookUrl: true,
    createdAt: true,
}

const merchantSelectWithSecrets = {
    id: true,
    webhookUrl: true,
    webhookSecret: true,
}

@Injectable()
export class MerchantsService {
    constructor(private readonly prisma: PrismaService) {}

    async create(dto: CreateMerchantDto) {
        const rawApiKey = `mk_${crypto.randomBytes(32).toString('hex')}`;
        const apiKeyHash = await argon2.hash(rawApiKey);
        const webhookSecret = `whsec_${crypto.randomBytes(32).toString('hex')}`;

        const merchant = await this.prisma.merchant.create({
            data: {
                name: dto.name,
                webhookUrl: dto.webhookUrl,
                apiKeyHash: apiKeyHash,
                webhookSecret,
            },
            select: merchantSelect
        });

        return { merchant, apiKey: rawApiKey, webhookSecret };
    }

    async findById( id: string) {
        return await this.prisma.merchant.findUnique({ 
            where: { id }, 
            select: merchantSelect 
        });
    }

    async findAllForAuth() {
        return await this.prisma.merchant.findMany({
            select: {
                id: true,
                name: true,
                apiKeyHash: true,
            }
        })
    }

    async findWebhookConfig(merchantId: string) {
        return await this.prisma.merchant.findUnique({
            where: { id: merchantId },
            select: merchantSelectWithSecrets,
        });
    }

    async update(merchantId: string, dto: UpdateMerchantDto) {
        return await this.prisma.merchant.update({
            where: { id: merchantId },
            data: { webhookUrl: dto.webhookUrl },
            select: { id: true, name: true, webhookUrl: true, updatedAt: true }, 
        });
    }

    async rotateWebhookSecret(merchantId: string) {
        const webhookSecret = `whsec_${crypto.randomBytes(32).toString('hex')}`;

        await this.prisma.merchant.update({
            where: { id: merchantId },
            data: { webhookSecret },
            select: { id: true },
        });

        return { webhookSecret };
    }

    async getDashboard(merchantId: string) {
        const [
            plansCount,
            subscriptionsCount,
            activeSubscriptionsCount,
            failedPaymentsCount,
            recentSubscriptions,
        ] = await Promise.all([
            this.prisma.plan.count({ where: { merchantId } }),
            this.prisma.subscription.count({ where: { merchantId } }),
            this.prisma.subscription.count({
                where: { merchantId, status: SubscriptionStatus.ACTIVE },
            }),
            this.prisma.paymentAttempt.count({
                where: {
                    status: {
                        in: [PaymentAttemptStatus.FAILED, PaymentAttemptStatus.TIMED_OUT],
                    },
                    subscription: { merchantId },
                },
            }),
            this.prisma.subscription.findMany({
                where: { merchantId },
                orderBy: { createdAt: 'desc' },
                take: 5,
                select: {
                    id: true,
                    customerPhone: true,
                    status: true,
                    nextBillingDate: true,
                    createdAt: true,
                    plan: {
                        select: {
                            name: true,
                            amount: true,
                        },
                    },
                },
            }),
        ]);

        return {
            merchantId,
            metrics: {
                plansCount,
                subscriptionsCount,
                activeSubscriptionsCount,
                failedPaymentsCount,
            },
            recentSubscriptions,
        };
    }

    async getAnalyticsSummary(merchantId: string) {
        const [subscriptions, paymentAttempts] = await Promise.all([
            this.prisma.subscription.findMany({
                where: { merchantId },
                select: {
                    id: true,
                    status: true,
                    plan: {
                        select: {
                            amount: true,
                        },
                    },
                },
            }),
            this.prisma.paymentAttempt.findMany({
                where: { subscription: { merchantId } },
                select: {
                    status: true,
                    amount: true,
                    createdAt: true,
                },
            }),
        ]);

        const activeSubscriptions = subscriptions.filter(
            (subscription) => subscription.status === SubscriptionStatus.ACTIVE,
        ).length;

        const retryingSubscriptions = subscriptions.filter(
            (subscription) =>
                subscription.status === SubscriptionStatus.RETRYING ||
                subscription.status === SubscriptionStatus.PAST_DUE,
        ).length;

        const monthlyRecurringRevenue = subscriptions
            .filter((subscription) => subscription.status === SubscriptionStatus.ACTIVE)
            .reduce((sum, subscription) => sum + Number(subscription.plan.amount), 0);

        const successfulPayments = paymentAttempts.filter(
            (attempt) => attempt.status === PaymentAttemptStatus.SUCCEEDED,
        );
        const totalRevenue = successfulPayments.reduce(
            (sum, attempt) => sum + Number(attempt.amount),
            0,
        );

        const failedPayments = paymentAttempts.filter(
            (attempt) =>
                attempt.status === PaymentAttemptStatus.FAILED ||
                attempt.status === PaymentAttemptStatus.TIMED_OUT,
        ).length;

        const revenueTrend = this.buildRevenueTrend(paymentAttempts);

        return {
            totalSubscriptions: subscriptions.length,
            activeSubscriptions,
            monthlyRecurringRevenue,
            totalRevenue,
            failedPayments,
            retryingSubscriptions,
            revenueTrend,
        };
    }

    async getDashboardOverview(merchantId: string) {
        const [subscriptions, paymentAttempts] = await Promise.all([
            this.prisma.subscription.findMany({
                where: { merchantId },
                select: {
                    id: true,
                    customerPhone: true,
                    status: true,
                    nextBillingDate: true,
                    createdAt: true,
                    plan: {
                        select: {
                            amount: true,
                        },
                    },
                },
                orderBy: {
                    createdAt: 'desc',
                },
            }),
            this.prisma.paymentAttempt.findMany({
                where: { subscription: { merchantId } },
                select: {
                    status: true,
                    amount: true,
                },
            }),
        ]);

        const activeSubscriptions = subscriptions.filter(
            (subscription) => subscription.status === SubscriptionStatus.ACTIVE,
        ).length;

        const monthlyRecurringRevenue = subscriptions
            .filter((subscription) => subscription.status === SubscriptionStatus.ACTIVE)
            .reduce((sum, subscription) => sum + Number(subscription.plan.amount), 0);

        const failedPayments = paymentAttempts.filter(
            (attempt) =>
                attempt.status === PaymentAttemptStatus.FAILED ||
                attempt.status === PaymentAttemptStatus.TIMED_OUT,
        ).length;

        const totalRevenue = paymentAttempts
            .filter((attempt) => attempt.status === PaymentAttemptStatus.SUCCEEDED)
            .reduce((sum, attempt) => sum + Number(attempt.amount), 0);

        return {
            totalSubscriptions: subscriptions.length,
            activeSubscriptions,
            monthlyRecurringRevenue,
            totalRevenue,
            failedPayments,
            recentSubscriptions: subscriptions.slice(0, 5).map((subscription) => ({
                id: subscription.id,
                customerPhone: subscription.customerPhone,
                status: subscription.status,
                nextBillingDate: subscription.nextBillingDate,
                amount: Number(subscription.plan.amount),
                createdAt: subscription.createdAt,
            })),
        };
    }

    private buildRevenueTrend(paymentAttempts: Array<{ status: string; amount: number | { toNumber?: () => number }; createdAt: Date }>) {
        const trend = [] as Array<{ date: string; revenue: number }>;
        const today = new Date();

        for (let offset = 6; offset >= 0; offset -= 1) {
            const target = new Date(today);
            target.setDate(today.getDate() - offset);
            const dateKey = target.toISOString().slice(0, 10);

            const revenue = paymentAttempts
                .filter(
                    (attempt) =>
                        attempt.status === PaymentAttemptStatus.SUCCEEDED &&
                        new Date(attempt.createdAt).toISOString().slice(0, 10) === dateKey,
                )
                .reduce((sum, attempt) => sum + Number(attempt.amount), 0);

            trend.push({ date: dateKey, revenue });
        }

        return trend;
    }
}
