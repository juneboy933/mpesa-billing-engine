import { Module } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { PlansModule } from '../plans/plans.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { MemberPortalController } from './member-portal.controller';
import { MemberPortalService } from './member-portal.service';

@Module({
  imports: [PlansModule, NotificationsModule, PaymentsModule],
  controllers: [SubscriptionsController, MemberPortalController],
  providers: [SubscriptionsService, MemberPortalService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
