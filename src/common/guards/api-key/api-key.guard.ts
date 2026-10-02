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

    const keyedApiKey = /^mk_([a-f0-9]{32})_([a-f0-9]{64})$/.exec(apiKey);
    if (keyedApiKey) {
      const [, apiKeyId, secret] = keyedApiKey;
      const merchant = await this.merchantsService.findByApiKeyId(apiKeyId);
      if (merchant && await argon2.verify(merchant.apiKeyHash, secret)) {
        req.merchant = { id: merchant.id, name: merchant.name };
        return true;
      }
      throw new UnauthorizedException('Invalid API key');
    }

    // Compatibility window for keys issued before IDs were introduced. Rotating
    // a legacy key moves that merchant to the indexed lookup path.
    if (!/^mk_[a-f0-9]{64}$/.test(apiKey)) {
      throw new UnauthorizedException('Invalid API key');
    }

    const legacyMerchants = await this.merchantsService.findLegacyApiKeys();
    for (const merchant of legacyMerchants) {
      if (await argon2.verify(merchant.apiKeyHash, apiKey)) {
        req.merchant = { id: merchant.id, name: merchant.name };
        return true;
      }
    }
    throw new UnauthorizedException('Invalid API key');
  }
}
