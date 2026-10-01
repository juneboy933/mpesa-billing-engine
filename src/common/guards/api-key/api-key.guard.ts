import { CanActivate, ExecutionContext, Injectable, Optional, UnauthorizedException } from '@nestjs/common';
// import { Observable } from 'rxjs';
import * as argon2 from 'argon2';
import { MerchantsService } from '../../../merchants/merchants.service';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../../../auth/auth.service';
import { readCookie, SESSION_COOKIE } from '../../../auth/auth.controller';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly merchantsService: MerchantsService,
    private readonly reflector: Reflector,
    @Optional() private readonly authService?: AuthService,
  ) {}

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    
    const req = context.switchToHttp().getRequest();
    const sessionId = readCookie(req.headers.cookie, SESSION_COOKIE);
    if (sessionId && this.authService) {
      const session = await this.authService.getSession(sessionId);
      if (session) {
        await this.authService.refreshSession(sessionId);
        req.merchant = session.merchant;
        return true;
      }
    }
    const apiKey = req.headers['x-api-key'];

    if(!apiKey || typeof apiKey !== 'string') {
      throw new UnauthorizedException('API key is missing from the request headers');
    }

    const merchants = await this.merchantsService.findAllForAuth();
    
    let matchedMerchant = null;

    for (const merchant of merchants) {
      const isMatch = await argon2.verify(merchant.apiKeyHash, apiKey);
      if (isMatch) {
        matchedMerchant = merchant;
        break;
      }
    }

    if (!matchedMerchant) {
      throw new UnauthorizedException('Invalid API key');
    }

    req.merchant = matchedMerchant;
    return true;
  }
}
