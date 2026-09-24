import { InternalServerErrorException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import axios from 'axios';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.module';
import { DarajaService } from './daraja.service';

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
    expect(redis.get).toHaveBeenCalledWith('daraja:access_token');
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it('fetches and caches a fresh token when no cache exists', async () => {
    redis.get.mockResolvedValue(null);
    jest.spyOn(axios, 'get').mockResolvedValue({
      data: { access_token: 'fresh-token', expires_in: '3600' },
    } as any);

    const result = await service.getAccessToken();

    expect(result).toBe('fresh-token');
    expect(redis.set).toHaveBeenCalledWith('daraja:access_token', 'fresh-token', 'EX', 3540);
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
      { headers: { Authorization: 'Bearer token-123' } },
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

  it('wraps STK push failures as a service unavailable exception', async () => {
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
    ).rejects.toThrow(ServiceUnavailableException);
  });
});
