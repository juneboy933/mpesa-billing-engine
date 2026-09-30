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
            currentPlan: subscription.plan,
            recentPayments: subscription.paymentAttempts,
        };
    }

    async payNow(merchantId: string, subscriptionId: string) {
        await this.getSubscriptionById(merchantId, subscriptionId);
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
