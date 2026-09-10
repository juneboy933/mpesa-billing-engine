import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WebhookGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
  ) {}

  canActivate(
    context: ExecutionContext,
  ): boolean {
    const req = context.switchToHttp().getRequest();
    const expectedToken = this.config.get('DARAJA_CALLBACK_TOKEN');

    if(!expectedToken) {
      throw new ForbiddenException('Callback token not configured.');
    }

    if(req.params.token !== expectedToken) {
      throw new ForbiddenException('Invalid callback token');
    }
    return true;
  }
}
