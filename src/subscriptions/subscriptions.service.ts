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
}

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
        })

        return {
            message: 'Subscription created successfully',
            data: subscription,
        }
    }

    async getAllSubscriptions(merchantId: string) {
        return await this.prisma.subscription.findMany({
            where: { merchantId },
            select: subscriptionSelect,
        });
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
            (a, b) => new Date(a.nextBillingDate).getTime() - new Date(b.nextBillingDate).getTime(),
        );

        return {
            total: orderedSubscriptions.length,
            retrying: orderedSubscriptions.filter((s) => s.status === SubscriptionStatus.RETRYING).length,
            pastDue: orderedSubscriptions.filter((s) => s.status === SubscriptionStatus.PAST_DUE).length,
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
        })
        return cancelledSubscription;
    }
}
