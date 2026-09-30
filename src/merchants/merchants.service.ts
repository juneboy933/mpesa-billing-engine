import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import * as crypto from 'crypto';
import * as argon2 from 'argon2';
import { UpdateMerchantDto } from './dto/update-merchant.dto';
import { PaymentAttemptStatus, SubscriptionStatus } from '../generated/prisma/enums';
import { OnboardMerchantDto } from './dto/onboard-merchant.dto';
import { SetupMpesaDto } from './dto/setup-mpesa.dto';
import { DarajaService } from '../payments/daraja/daraja.service';
import { MpesaCredentialsService } from './mpesa-credentials.service';
import { CreatePlanDto } from '../plans/dto/create-plan.dto';

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

const planSelect = {
    id: true,
    name: true,
    amount: true,
    interval: true,
    createdAt: true,
};

@Injectable()
export class MerchantsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly darajaService: DarajaService,
        private readonly mpesaCredentialsService: MpesaCredentialsService,
    ) {}

    async startOnboarding(dto: CreateMerchantDto) {
        const result = await this.create(dto);

        return {
            ...result,
            onboarding: {
                status: 'MPESA_SETUP_REQUIRED',
                nextStep: 'MPESA_SETUP',
            },
        };
    }

    async getOnboardingStatus(merchantId: string) {
        const merchant = await this.prisma.merchant.findUnique({
            where: { id: merchantId },
            select: {
                id: true,
                name: true,
                mpesaSetupStatus: true,
                mpesaSetupCompletedAt: true,
                plans: {
                    orderBy: { createdAt: 'asc' },
                    take: 1,
                    select: { id: true, name: true, amount: true, interval: true, createdAt: true },
                },
            },
        });

        if (!merchant) {
            return {
                merchantId,
                businessName: null,
                mpesaSetup: { status: 'PENDING', completedAt: null },
                firstPlan: { status: 'REQUIRED' },
                nextStep: 'MPESA_SETUP',
            };
        }

        const setupComplete = merchant.mpesaSetupStatus === 'COMPLETED';
        const hasPlan = merchant.plans.length > 0;

        return {
            merchantId: merchant.id,
            businessName: merchant.name,
            mpesaSetup: {
                status: merchant.mpesaSetupStatus,
                completedAt: merchant.mpesaSetupCompletedAt,
            },
            firstPlan: hasPlan ? { status: 'COMPLETED', plan: merchant.plans[0] } : { status: 'REQUIRED' },
            nextStep: !setupComplete ? 'MPESA_SETUP' : !hasPlan ? 'FIRST_PLAN' : 'DASHBOARD',
        };
    }

    async completeOnboarding(merchantId: string, dto: CreatePlanDto) {
        const merchant = await this.prisma.merchant.findUnique({
            where: { id: merchantId },
            select: { id: true, mpesaSetupStatus: true },
        });

        if (!merchant) {
            throw new BadRequestException('Merchant onboarding session not found');
        }

        if (merchant.mpesaSetupStatus !== 'COMPLETED') {
            throw new BadRequestException('Complete M-Pesa setup before creating a plan');
        }

        const plan = await this.prisma.plan.create({
            data: {
                name: dto.name.trim(),
                amount: dto.amount,
                merchantId,
            },
            select: planSelect,
        });

        return { status: 'COMPLETE', plan };
    }

    async setupMpesa(merchantId: string, dto: SetupMpesaDto) {
        const validation = await this.darajaService.validateCredentials(dto);
        if (!validation.valid) {
            throw new BadRequestException(validation.message ?? 'Invalid M-Pesa credentials');
        }

        const completedAt = new Date();
        await this.prisma.merchant.update({
            where: { id: merchantId },
            data: {
                mpesaConsumerKeyEncrypted: this.mpesaCredentialsService.encrypt(dto.consumerKey),
                mpesaConsumerSecretEncrypted: this.mpesaCredentialsService.encrypt(dto.consumerSecret),
                mpesaShortcode: dto.shortcode,
                mpesaPasskeyEncrypted: this.mpesaCredentialsService.encrypt(dto.passkey),
                mpesaSetupStatus: 'COMPLETED',
                mpesaSetupCompletedAt: completedAt,
            },
            select: { id: true, mpesaShortcode: true, mpesaSetupCompletedAt: true },
        });

        return {
            merchantId,
            status: 'COMPLETED',
            shortcode: dto.shortcode,
            completedAt,
        };
    }

    async getMpesaSetupStatus(merchantId: string) {
        const merchant = await this.prisma.merchant.findUnique({
            where: { id: merchantId },
            select: {
                id: true,
                mpesaShortcode: true,
                mpesaSetupStatus: true,
                mpesaSetupCompletedAt: true,
            },
        });

        return {
            merchantId: merchant?.id ?? merchantId,
            status: merchant?.mpesaSetupStatus ?? 'PENDING',
            shortcode: merchant?.mpesaShortcode ?? null,
            completedAt: merchant?.mpesaSetupCompletedAt ?? null,
        };
    }

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

    async onboard(dto: OnboardMerchantDto) {
        const rawApiKey = `mk_${crypto.randomBytes(32).toString('hex')}`;
        const apiKeyHash = await argon2.hash(rawApiKey);
        const webhookSecret = `whsec_${crypto.randomBytes(32).toString('hex')}`;

        const result = await this.prisma.$transaction(async (tx) => {
            const merchant = await tx.merchant.create({
                data: {
                    name: dto.name,
                    webhookUrl: dto.webhookUrl,
                    apiKeyHash,
                    webhookSecret,
                },
                select: merchantSelect,
            });

            const plan = await tx.plan.create({
                data: {
                    name: dto.planName.trim(),
                    amount: dto.planAmount,
                    merchantId: merchant.id,
                },
                select: {
                    id: true,
                    name: true,
                    amount: true,
                    interval: true,
                    createdAt: true,
                },
            });

            return { merchant, plan };
        });

        return {
            ...result,
            apiKey: rawApiKey,
            webhookSecret,
        };
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

    async getDashboard(merchantId: string) {
        const [plansCount, subscriptionsCount, failedPaymentsCount, recentSubscriptions] = await Promise.all([
            this.prisma.plan.count({ where: { merchantId } }),
            this.prisma.subscription.count({ where: { merchantId } }),
            this.prisma.paymentAttempt.count({
                where: {
                    status: { in: [PaymentAttemptStatus.FAILED, PaymentAttemptStatus.TIMED_OUT] },
                    subscription: { merchantId },
                },
            }),
            this.prisma.subscription.findMany({
                where: { merchantId },
                orderBy: { createdAt: 'desc' },
                take: 10,
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
                activeSubscriptionsCount: recentSubscriptions.filter(
                    (subscription) => subscription.status === SubscriptionStatus.ACTIVE,
                ).length,
                failedPaymentsCount,
            },
            recentSubscriptions,
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
