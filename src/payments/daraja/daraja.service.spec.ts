import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import axios from 'axios';
import { REDIS_CLIENT } from '../../redis/redis.module';
import { DarajaService, StkPushOutcomeUnknownError } from './daraja.service';

describe('DarajaService', () => {
  let service: DarajaService;
  let redis: { get: jest.Mock; set: jest.Mock };
  let config: { get: jest.Mock };

  beforeEach(async () => {
    redis = { get: jest.fn(), set: jest.fn() };
    config = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          MPESA_TOKEN_URL: 'https://example.com/token',
          NODE_ENV: 'test',
          CONSUMER_KEY: 'consumer-key',
          CONSUMER_SECRET: 'consumer-secret',
          SHORT_CODE: '600123',
          PASSKEY: 'passkey',
          STK_PUSH_URL: 'https://example.com/stk-push',
          MPESA_CALLBACK_URL: 'https://example.com/callback',
        };
        return values[key] ?? undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DarajaService,
        { provide: REDIS_CLIENT, useValue: redis },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get<DarajaService>(DarajaService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns a cached token without calling the M-Pesa API again', async () => {
    redis.get.mockResolvedValue('cached-token');
    const axiosGet = jest.spyOn(axios, 'get');

    const result = await service.getAccessToken();

    expect(result).toBe('cached-token');
    expect(redis.get).toHaveBeenCalledWith(expect.stringMatching(/^daraja:access_token:[a-f0-9]{64}$/));
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it('fetches and caches a fresh token when no cache exists', async () => {
    redis.get.mockResolvedValue(null);
    jest.spyOn(axios, 'get').mockResolvedValue({
      data: { access_token: 'fresh-token', expires_in: '3600' },
    } as any);

    const result = await service.getAccessToken();

    expect(result).toBe('fresh-token');
    expect(redis.set).toHaveBeenCalledWith(expect.stringMatching(/^daraja:access_token:[a-f0-9]{64}$/), 'fresh-token', 'EX', 3540);
  });

  it('uses a separate token cache key for each merchant credential pair', async () => {
    redis.get.mockResolvedValue(null);
    const axiosGet = jest.spyOn(axios, 'get');
    axiosGet
      .mockResolvedValueOnce({ data: { access_token: 'merchant-a-token', expires_in: '3600' } } as any)
      .mockResolvedValueOnce({ data: { access_token: 'merchant-b-token', expires_in: '3600' } } as any);

    const merchantA = { consumerKey: 'key-a', consumerSecret: 'secret-a', shortcode: '600111', passkey: 'pass-a' };
    const merchantB = { consumerKey: 'key-b', consumerSecret: 'secret-b', shortcode: '600222', passkey: 'pass-b' };

    await expect(service.getAccessToken(merchantA)).resolves.toBe('merchant-a-token');
    await expect(service.getAccessToken(merchantB)).resolves.toBe('merchant-b-token');

    const cacheKeys = redis.set.mock.calls.map(([key]) => key);
    expect(cacheKeys[0]).not.toBe(cacheKeys[1]);
    expect(cacheKeys.every((key) => String(key).startsWith('daraja:access_token:'))).toBe(true);
  });

  it('does not use shared environment credentials outside local development and tests', async () => {
    config.get.mockImplementation((key: string) => ({
      NODE_ENV: 'production',
      MPESA_TOKEN_URL: 'https://example.com/token',
      CONSUMER_KEY: 'shared-key',
      CONSUMER_SECRET: 'shared-secret',
      SHORT_CODE: '600123',
      PASSKEY: 'passkey',
    }[key]));
    const axiosGet = jest.spyOn(axios, 'get');

    await expect(service.getAccessToken()).rejects.toThrow('Merchant M-Pesa credentials are required');
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it('generates the Daraja password from the short code, passkey, and timestamp', () => {
    jest.spyOn(service, 'generateTimestamp').mockReturnValue('20240101010101');

    const result = service.generatePassword();

    expect(result).toBe(Buffer.from('600123passkey20240101010101').toString('base64'));
  });

  it('triggers an STK push using the normalized phone and auth token', async () => {
    jest.spyOn(service, 'getAccessToken').mockResolvedValue('token-123');
    jest.spyOn(service, 'generateTimestamp').mockReturnValue('20240101010101');
    jest.spyOn(axios, 'post').mockResolvedValue({
      data: {
        MerchantRequestID: 'req-1',
        CheckoutRequestID: 'ws_CO_123',
        ResponseCode: '0',
        ResponseDescription: 'Accepted',
        CustomerMessage: 'Success',
      },
    } as any);

    const result = await service.triggerStk({
      phone: '0712345678',
      amount: 1200,
      accountReference: 'Gold plan',
      transactionDec: 'Gold plan subscription',
    });

    expect(axios.post).toHaveBeenCalledWith(
      'https://example.com/stk-push',
      expect.objectContaining({
        BusinessShortCode: '600123',
        Amount: '1200',
        PartyA: '254712345678',
        PhoneNumber: '254712345678',
        AccountReference: 'Gold plan',
        TransactionDesc: 'Gold plan subscription',
        Timestamp: '20240101010101',
      }),
      { headers: { Authorization: 'Bearer token-123' }, timeout: 30_000 },
    );
    expect(result).toEqual({
      MerchantRequestID: 'req-1',
      CheckoutRequestID: 'ws_CO_123',
      ResponseCode: '0',
      ResponseDescription: 'Accepted',
      CustomerMessage: 'Success',
    });
  });

  it('throws when the M-Pesa config is incomplete', async () => {
    config.get.mockImplementation((key: string) => ({ MPESA_TOKEN_URL: undefined }[key]));

    await expect(service.getAccessToken()).rejects.toThrow(InternalServerErrorException);
  });

  it('marks STK transport failures as an unknown outcome to prevent duplicate prompts', async () => {
    jest.spyOn(service, 'getAccessToken').mockResolvedValue('token-123');
    jest.spyOn(service, 'generateTimestamp').mockReturnValue('20240101010101');
    jest.spyOn(service, 'generatePassword').mockReturnValue('password');
    jest.spyOn(axios, 'post').mockRejectedValue(new Error('network down'));

    await expect(
      service.triggerStk({
        phone: '0712345678',
        amount: 1200,
        accountReference: 'Gold plan',
        transactionDec: 'Gold plan subscription',
      }),
    ).rejects.toThrow(StkPushOutcomeUnknownError);
  });
});
