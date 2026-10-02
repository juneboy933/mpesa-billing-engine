import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PlansService } from '../plans/plans.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { normalizePhone } from '../common/utils/phone.util';
import { SubscriptionStatus } from '../generated/prisma/enums';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';

const subscriptionSelect = {
    id: true,
    customerPhone: true,
    nextBillingDate: true,
    status: true,
    createdAt: true,
};

@Injectable()
export class SubscriptionsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly plansService: PlansService,
        private readonly paymentsService: PaymentsService,
        private readonly notificationsService: NotificationsService,
    ) {}

    async createSubscription(merchantId: string, dto: CreateSubscriptionDto) {
        const plan = await this.plansService.findById(merchantId, dto.planId);
        const normalizedPhone = normalizePhone(dto.customerPhone);

        const subscription = await this.prisma.subscription.create({
            data: {
                merchantId,
                planId: plan.id,
                customerPhone: normalizedPhone,
                nextBillingDate: new Date(),
            },
            select: subscriptionSelect,
        });

        return {
            message: 'Subscription created successfully',
            data: subscription,
        };
    }

    async getRetryQueue(merchantId: string) {
        const subscriptions = await this.prisma.subscription.findMany({
            where: {
                merchantId,
                status: { in: [SubscriptionStatus.RETRYING, SubscriptionStatus.PAST_DUE] },
            },
            orderBy: { nextBillingDate: 'asc' },
            select: {
                id: true,
                customerPhone: true,
                status: true,
                nextBillingDate: true,
                createdAt: true,
                plan: {
                    select: {
                        id: true,
                        name: true,
                        amount: true,
                    },
                },
            },
        });

        const orderedSubscriptions = [...subscriptions].sort(
            (first, second) => new Date(first.nextBillingDate).getTime() - new Date(second.nextBillingDate).getTime(),
        );

        return {
            total: orderedSubscriptions.length,
            retrying: orderedSubscriptions.filter((subscription) => subscription.status === SubscriptionStatus.RETRYING).length,
            pastDue: orderedSubscriptions.filter((subscription) => subscription.status === SubscriptionStatus.PAST_DUE).length,
            subscriptions: orderedSubscriptions,
        };
    }

    async triggerRetry(merchantId: string, subscriptionId: string) {
        const subscription = await this.prisma.subscription.findFirst({
            where: { id: subscriptionId, merchantId },
            select: { id: true },
        });

        if (!subscription) {
            throw new NotFoundException('Subscription not found');
        }

        return await this.paymentsService.triggerSTkPush(subscriptionId);
    }

    async getManagementOverview(merchantId: string, requestedPage = 1) {
        const pageSize = 20;
        const requested = Number.isFinite(requestedPage) ? Math.max(1, Math.floor(requestedPage)) : 1;
        const where = { merchantId };
        const totalSubscriptions = await this.prisma.subscription.count({ where });
        const totalPages = Math.ceil(totalSubscriptions / pageSize);
        const page = Math.min(requested, totalPages || 1);
        const [activeSubscriptions, subscriptions] = await Promise.all([
            this.prisma.subscription.count({ where: { ...where, status: SubscriptionStatus.ACTIVE } }),
            this.prisma.subscription.findMany({
                where,
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                skip: (page - 1) * pageSize,
                take: pageSize,
                select: {
                    id: true,
                    customerPhone: true,
                    status: true,
                    nextBillingDate: true,
                    createdAt: true,
                    plan: {
                        select: {
                            id: true,
                            name: true,
                            amount: true,
                        },
                    },
                },
            }),
        ]);

        return {
            totalSubscriptions,
            activeSubscriptions,
            page,
            pageSize,
            totalPages,
            subscriptions,
        };
    }

    async getReceipts(merchantId: string, subscriptionId: string) {
        return await this.paymentsService.getReceipts(merchantId, subscriptionId);
    }

    async getReceiptById(merchantId: string, subscriptionId: string, receiptId: string) {
        return await this.paymentsService.getReceiptById(merchantId, subscriptionId, receiptId);
    }

    async getCustomerPortal(merchantId: string, subscriptionId: string) {
        const subscription = await this.prisma.subscription.findFirst({
            where: { id: subscriptionId, merchantId },
            select: {
                id: true,
                customerPhone: true,
                status: true,
                nextBillingDate: true,
                createdAt: true,
                plan: {
                    select: {
                        id: true,
                        name: true,
                        amount: true,
                    },
                },
                paymentAttempts: {
                    orderBy: { createdAt: 'desc' },
                    take: 10,
                    select: {
                        id: true,
                        status: true,
                        amount: true,
                        createdAt: true,
                    },
                },
            },
        });

        if (!subscription) {
            throw new NotFoundException('Subscription not found');
        }

        return {
            subscriptionId: subscription.id,
            customerPhone: subscription.customerPhone,
            status: subscription.status,
            nextBillingDate: subscription.nextBillingDate,
            createdAt: subscription.createdAt,
            currentPlan: subscription.plan,
            recentPayments: subscription.paymentAttempts,
        };
    }

    async payNow(merchantId: string, subscriptionId: string) {
        await this.getSubscriptionById(merchantId, subscriptionId);
        await this.paymentsService.triggerSTkPush(subscriptionId);

        return {
            message: 'Payment request sent',
            subscriptionId,
        };
    }

    async getSubscriptionById(merchantId: string, subscriptionId: string) {
        const subscription = await this.prisma.subscription.findFirst({
            where: { id: subscriptionId, merchantId },
            select: subscriptionSelect,
        });

        if (!subscription) {
            throw new NotFoundException('Subscription not found');
        }

        return subscription;
    }

    async cancelSubscription(merchantId: string, subscriptionId: string) {
        const subscription = await this.getSubscriptionById(merchantId, subscriptionId);
        const cancelledSubscription = await this.prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: SubscriptionStatus.CANCELLED },
            select: subscriptionSelect,
        });

        await this.notificationsService.send(merchantId, 'subscription.cancelled', {
            subscriptionId,
        });

        return cancelledSubscription;
    }
}
