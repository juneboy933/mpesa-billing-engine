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

  it('uses the public key ID to load one hash and attaches only public merchant fields', async () => {
    const secret = 'a'.repeat(64);
    const key = `mk_${'b'.repeat(32)}_${secret}`;
    const merchant = { id: 'merchant_1', name: 'Acme', apiKeyId: 'b'.repeat(32), apiKeyHash: await argon2.hash(secret) };
    const merchantsService = { findByApiKeyId: jest.fn().mockResolvedValue(merchant), findLegacyApiKeys: jest.fn() };
    const guard = new ApiKeyGuard(merchantsService as any, new Reflector());
    const context = buildContext(key) as any;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(merchantsService.findByApiKeyId).toHaveBeenCalledWith('b'.repeat(32));
    expect(merchantsService.findLegacyApiKeys).not.toHaveBeenCalled();
    expect(context.switchToHttp().getRequest().merchant).toEqual({ id: merchant.id, name: merchant.name });
  });

  it('throws UnauthorizedException when the key is missing', async () => {
    const merchantsService = { findByApiKeyId: jest.fn(), findLegacyApiKeys: jest.fn() };
    const guard = new ApiKeyGuard(merchantsService as any, new Reflector());

    await expect(guard.canActivate(buildContext() as any)).rejects.toThrow(UnauthorizedException);
    expect(merchantsService.findByApiKeyId).not.toHaveBeenCalled();
    expect(merchantsService.findLegacyApiKeys).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException when the key is invalid', async () => {
    const merchantsService = { findByApiKeyId: jest.fn().mockResolvedValue(null), findLegacyApiKeys: jest.fn() };
    const guard = new ApiKeyGuard(merchantsService as any, new Reflector());

    await expect(guard.canActivate(buildContext(`mk_${'b'.repeat(32)}_${'c'.repeat(64)}`) as any)).rejects.toThrow(UnauthorizedException);
    expect(merchantsService.findLegacyApiKeys).not.toHaveBeenCalled();
  });

  it('supports legacy keys during the migration window', async () => {
    const key = `mk_${'a'.repeat(64)}`;
    const merchant = { id: 'merchant_1', name: 'Acme', apiKeyHash: await argon2.hash(key) };
    const merchantsService = { findByApiKeyId: jest.fn(), findLegacyApiKeys: jest.fn().mockResolvedValue([merchant]) };
    const guard = new ApiKeyGuard(merchantsService as any, new Reflector());
    const context = buildContext(key) as any;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(merchantsService.findLegacyApiKeys).toHaveBeenCalledTimes(1);
    expect(context.switchToHttp().getRequest().merchant).toEqual({ id: merchant.id, name: merchant.name });
  });

  it('bypasses validation for routes marked public', async () => {
    const merchantsService = { findByApiKeyId: jest.fn(), findLegacyApiKeys: jest.fn() };
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(true) };
    const guard = new ApiKeyGuard(merchantsService as any, reflector as any);

    await expect(guard.canActivate(buildContext('ignored') as any)).resolves.toBe(true);
    expect(merchantsService.findByApiKeyId).not.toHaveBeenCalled();
    expect(merchantsService.findLegacyApiKeys).not.toHaveBeenCalled();
  });
});
