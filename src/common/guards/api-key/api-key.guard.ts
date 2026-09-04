import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
// import { Observable } from 'rxjs';
import * as argon2 from 'argon2';
import { MerchantsService } from '../../../merchants/merchants.service';
import { Reflector } from '@nestjs/core';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly merchantsService: MerchantsService,
    private readonly reflector: Reflector
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
