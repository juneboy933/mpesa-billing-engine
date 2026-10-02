import { UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';

describe('AuthService password authentication', () => {
  let service: AuthService;
  let redis: { get: jest.Mock; set: jest.Mock; del: jest.Mock; incr: jest.Mock; expire: jest.Mock };
  let merchants: { findForPasswordAuth: jest.Mock; findForPasswordAuthById: jest.Mock; setPassword: jest.Mock; findById: jest.Mock };

  beforeEach(() => {
    redis = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue('OK'), del: jest.fn().mockResolvedValue(1), incr: jest.fn().mockResolvedValue(1), expire: jest.fn().mockResolvedValue(1) };
    merchants = { findForPasswordAuth: jest.fn(), findForPasswordAuthById: jest.fn(), setPassword: jest.fn(), findById: jest.fn() };
    service = new AuthService(redis as never, merchants as never);
  });

  it('verifies a password and creates a 24-hour session', async () => {
    merchants.findForPasswordAuth.mockResolvedValue({ id: 'm1', passwordHash: await argon2.hash('a-long-test-password') });
    const session = await service.signIn('0712345678', 'a-long-test-password');
    expect(session).toMatchObject({ merchantId: 'm1', sessionId: expect.any(String), expiresIn: 86400 });
    expect(redis.set).toHaveBeenCalledWith(expect.stringMatching(/^auth:session:/), expect.stringContaining('"merchantId":"m1"'), 'EX', 86400);
    expect(redis.del).toHaveBeenCalledWith('auth:password-failures:254712345678');
  });

  it('uses the same failure for unknown merchants and wrong passwords and counts failures', async () => {
    merchants.findForPasswordAuth.mockResolvedValue(null);
    await expect(service.signIn('0712345678', 'wrong')).rejects.toThrow(new UnauthorizedException('Phone number or password is incorrect'));
    expect(redis.incr).toHaveBeenCalledWith('auth:password-failures:254712345678');
    expect(redis.expire).toHaveBeenCalledWith('auth:password-failures:254712345678', 900);
  });

  it('blocks further password checks after five failed attempts', async () => {
    redis.get.mockResolvedValue('5');
    await expect(service.signIn('0712345678', 'wrong')).rejects.toThrow(UnauthorizedException);
    expect(merchants.findForPasswordAuth).not.toHaveBeenCalled();
  });

  it('allows an authenticated legacy merchant to set an initial password', async () => {
    merchants.findForPasswordAuthById.mockResolvedValue({ id: 'm1', passwordHash: null });
    merchants.setPassword.mockResolvedValue({ message: 'Password updated' });
    await expect(service.setPassword('m1', 'a-long-test-password')).resolves.toEqual({ message: 'Password updated' });
    expect(merchants.setPassword).toHaveBeenCalledWith('m1', 'a-long-test-password');
  });

  it('requires the current password when changing an existing password', async () => {
    merchants.findForPasswordAuthById.mockResolvedValue({ id: 'm1', passwordHash: await argon2.hash('current-password') });
    await expect(service.setPassword('m1', 'a-new-long-password', 'wrong-password')).rejects.toThrow(UnauthorizedException);
    expect(merchants.setPassword).not.toHaveBeenCalled();
  });
});
