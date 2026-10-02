import { Controller, Get, Header, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { MemberPortalService } from './member-portal.service';

@ApiTags('member-portal')
@Public()
@Controller('customer/portal')
export class MemberPortalController {
  constructor(private readonly memberPortal: MemberPortalService) {}

  @Get(':token')
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @ApiParam({ name: 'token', description: 'Expiring member access token' })
  @ApiOperation({ summary: 'View subscription and payment history through an expiring member link' })
  getPortal(@Param('token') token: string) {
    return this.memberPortal.getPortal(token);
  }

  @Post(':token/pay-now')
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'token', description: 'Expiring member access token' })
  @ApiOperation({ summary: 'Request an M-Pesa payment for the subscription in a member link' })
  payNow(@Param('token') token: string) {
    return this.memberPortal.payNow(token);
  }
}
