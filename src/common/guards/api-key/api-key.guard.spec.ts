import * as argon2 from 'argon2';
import { Reflector } from '@nestjs/core';
import { UnauthorizedException } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';

describe('ApiKeyGuard', () => {
  const buildContext = (apiKey?: string) => {
    const request = {
      headers: apiKey === undefined ? {} : { 'x-api-key': apiKey },
    };

    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    };
  };

  it('accepts a valid key and attaches the matched merchant to the request', async () => {
    const key = 'valid-key';
    const merchant = { id: 'merchant_1', apiKeyHash: await argon2.hash(key) };
    const merchantsService = { findAllForAuth: jest.fn().mockResolvedValue([merchant]) };
    const guard = new ApiKeyGuard(merchantsService as any, new Reflector());
    const context = buildContext(key) as any;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(context.switchToHttp().getRequest().merchant).toEqual(merchant);
  });

  it('throws UnauthorizedException when the key is missing', async () => {
    const merchantsService = { findAllForAuth: jest.fn() };
    const guard = new ApiKeyGuard(merchantsService as any, new Reflector());

    await expect(guard.canActivate(buildContext() as any)).rejects.toThrow(UnauthorizedException);
    expect(merchantsService.findAllForAuth).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException when the key is invalid', async () => {
    const merchantsService = {
      findAllForAuth: jest.fn().mockResolvedValue([{ id: 'merchant_1', apiKeyHash: await argon2.hash('real-key') }]),
    };
    const guard = new ApiKeyGuard(merchantsService as any, new Reflector());

    await expect(guard.canActivate(buildContext('wrong-key') as any)).rejects.toThrow(UnauthorizedException);
  });

  it('bypasses validation for routes marked public', async () => {
    const merchantsService = { findAllForAuth: jest.fn() };
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(true) };
    const guard = new ApiKeyGuard(merchantsService as any, reflector as any);

    await expect(guard.canActivate(buildContext('ignored') as any)).resolves.toBe(true);
    expect(merchantsService.findAllForAuth).not.toHaveBeenCalled();
  });
});
