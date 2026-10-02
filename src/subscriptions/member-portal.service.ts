import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { SubscriptionStatus } from '../generated/prisma/enums';

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class MemberPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
    private readonly payments: PaymentsService,
  ) {}

  async issueLinkAndSendSms(merchantId: string, subscriptionId: string) {
    const subscription = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, merchantId },
      select: {
        id: true,
        customerPhone: true,
        plan: { select: { name: true, amount: true, interval: true } },
        merchant: { select: { name: true } },
      },
    });
    if (!subscription) throw new NotFoundException('Subscription not found');

    const frontendUrl = this.config.get<string>('FRONTEND_URL');
    if (!frontendUrl) throw new ServiceUnavailableException('Member portal URL is not configured');
    let portalBaseUrl: URL;
    try {
      portalBaseUrl = new URL(frontendUrl);
    } catch {
      throw new ServiceUnavailableException('Member portal URL is not configured correctly');
    }

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
    const tokenRecord = await this.prisma.memberPortalToken.create({
      data: { tokenHash, expiresAt, subscriptionId: subscription.id },
      select: { id: true },
    });

    const portalUrl = new URL(`/member/${rawToken}`, portalBaseUrl).toString();
    const interval = subscription.plan.interval === 'WEEKLY' ? 'week' : 'month';
    const message = `${subscription.merchant.name}: Your ${subscription.plan.name} membership is KES ${Number(subscription.plan.amount).toLocaleString('en-KE')} per ${interval}. View your next payment and payment history: ${portalUrl} (link expires in 24 hours).`;

    try {
      await this.notifications.queueSms(message, subscription.customerPhone, `member-link:${tokenRecord.id}`);
    } catch {
      await this.prisma.memberPortalToken.updateMany({
        where: { id: tokenRecord.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new ServiceUnavailableException('The member link could not be queued for SMS. Please try again.');
    }

    return { message: 'Member link queued for SMS', expiresAt };
  }

  async getPortal(rawToken: string) {
    const token = await this.findValidToken(rawToken);
    const { subscription } = token;

    return {
      businessName: subscription.merchant.name,
      subscriptionId: subscription.id,
      status: subscription.status,
      nextPaymentAt: subscription.nextBillingDate,
      plan: {
        name: subscription.plan.name,
        amount: Number(subscription.plan.amount),
        interval: subscription.plan.interval,
      },
      recentAttempts: subscription.paymentAttempts.map((attempt) => ({
        id: attempt.id,
        status: attempt.status,
        amount: Number(attempt.amount),
        attemptedAt: attempt.createdAt,
        resolvedAt: attempt.resolvedAt,
        receiptNumber: attempt.mpesaReceiptNumber,
        transactionDate: attempt.mpesaTransactionDate,
      })),
      expiresAt: token.expiresAt,
      canPayNow: subscription.status !== SubscriptionStatus.CANCELLED,
    };
  }

  async payNow(rawToken: string) {
    const { subscription } = await this.findValidToken(rawToken);
    if (subscription.status === SubscriptionStatus.CANCELLED) {
      throw new ConflictException('This subscription has been cancelled and cannot be charged');
    }

    await this.payments.triggerSTkPush(subscription.id);
    return { message: 'M-Pesa payment request sent', subscriptionId: subscription.id };
  }

  private async findValidToken(rawToken: string) {
    if (!/^[\w-]{40,60}$/.test(rawToken)) throw new NotFoundException('Member link is invalid or expired');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const token = await this.prisma.memberPortalToken.findUnique({
      where: { tokenHash },
      include: {
        subscription: {
          include: {
            merchant: { select: { name: true } },
            plan: { select: { name: true, amount: true, interval: true } },
            paymentAttempts: {
              orderBy: { createdAt: 'desc' },
              take: 20,
              select: {
                id: true,
                status: true,
                amount: true,
                createdAt: true,
                resolvedAt: true,
                mpesaReceiptNumber: true,
                mpesaTransactionDate: true,
              },
            },
          },
        },
      },
    });
    if (!token || token.revokedAt || token.expiresAt <= new Date()) {
      throw new NotFoundException('Member link is invalid or expired');
    }
    return token;
  }
}
