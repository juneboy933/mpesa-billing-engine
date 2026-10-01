import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { MerchantsService } from '../merchants/merchants.service';
import { CradleVoicesService } from '../notifications/cradle-voices.service';

describe('AuthService', () => {
  let service: AuthService;
  let redis: { get: jest.Mock; set: jest.Mock; del: jest.Mock; incr: jest.Mock; expire: jest.Mock };
  let merchants: { findByPhoneNumber: jest.Mock };
  let cradle: { sendSms: jest.Mock };

  beforeEach(() => {
    redis = { get: jest.fn(), set: jest.fn(), del: jest.fn(), incr: jest.fn(), expire: jest.fn() };
    merchants = { findByPhoneNumber: jest.fn() };
    cradle = { sendSms: jest.fn().mockResolvedValue({ accepted: true }) };
    service = new AuthService(redis as never, merchants as never, cradle as never);
  });

  it('sends a six-digit OTP to a registered merchant phone', async () => {
    merchants.findByPhoneNumber.mockResolvedValue({ id: 'm1', phoneNumber: '254712345678' });
    redis.incr.mockResolvedValue(1);
    redis.set.mockResolvedValue('OK');

    await expect(service.requestOtp('0712345678')).resolves.toEqual({ message: 'If the number is registered, an OTP has been sent' });

    expect(redis.set).toHaveBeenCalledWith(expect.stringMatching(/^auth:otp:254712345678:/), expect.any(String), 'EX', 300);
    expect(cradle.sendSms).toHaveBeenCalledWith(expect.stringMatching(/^Your NiaFlow verification code is \d{6}\./), ['254712345678']);
  });

  it('does not reveal whether an unregistered phone exists', async () => {
    merchants.findByPhoneNumber.mockResolvedValue(null);

    await expect(service.requestOtp('+254712345678')).resolves.toEqual({ message: 'If the number is registered, an OTP has been sent' });
    expect(cradle.sendSms).not.toHaveBeenCalled();
  });

  it('verifies an OTP once and creates a 24-hour session', async () => {
    merchants.findByPhoneNumber.mockResolvedValue({ id: 'm1', phoneNumber: '254712345678', name: 'Gym' });
    redis.get.mockResolvedValueOnce(JSON.stringify({ codeHash: service.hashCode('482913'), merchantId: 'm1' }));
    redis.set.mockResolvedValue('OK');

    await expect(service.verifyOtp('254712345678', '482913')).resolves.toMatchObject({ merchantId: 'm1', sessionId: expect.any(String), expiresIn: 86400 });
    expect(redis.del).toHaveBeenCalledWith(expect.stringMatching(/^auth:otp:254712345678:/));
    expect(redis.set).toHaveBeenCalledWith(expect.stringMatching(/^auth:session:/), expect.stringContaining('"merchantId":"m1"'), 'EX', 86400);
  });

  it('rejects invalid or expired OTPs', async () => {
    merchants.findByPhoneNumber.mockResolvedValue({ id: 'm1', phoneNumber: '254712345678' });
    redis.get.mockResolvedValue(null);

    await expect(service.verifyOtp('0712345678', '123456')).rejects.toThrow(UnauthorizedException);
  });

  it('logs out by immediately deleting the Redis session', async () => {
    redis.del.mockResolvedValue(1);
    await expect(service.logout('session_1')).resolves.toEqual({ message: 'Logged out' });
    expect(redis.del).toHaveBeenCalledWith('auth:session:session_1');
  });

  it('rejects too many OTP requests for a phone', async () => {
    merchants.findByPhoneNumber.mockResolvedValue({ id: 'm1', phoneNumber: '254712345678' });
    redis.incr.mockResolvedValue(4);

    await expect(service.requestOtp('254712345678')).rejects.toThrow(BadRequestException);
    expect(cradle.sendSms).not.toHaveBeenCalled();
  });
});
