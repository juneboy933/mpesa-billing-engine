import { AuthController, SESSION_COOKIE } from './auth.controller';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: { requestOtp: jest.Mock; verifyOtp: jest.Mock; logout: jest.Mock };

  beforeEach(() => {
    authService = { requestOtp: jest.fn(), verifyOtp: jest.fn(), logout: jest.fn() };
    controller = new AuthController(authService as never);
  });

  it('creates an HttpOnly lax session cookie after OTP verification', async () => {
    authService.verifyOtp.mockResolvedValue({ merchantId: 'm1', sessionId: 'session_1', expiresIn: 86400 });
    const response = { cookie: jest.fn() };

    await expect(controller.verifyOtp({ phone: '0712345678', code: '482913' }, response as never))
      .resolves.toEqual({ merchantId: 'm1', expiresIn: 86400 });
    expect(response.cookie).toHaveBeenCalledWith(SESSION_COOKIE, 'session_1', expect.objectContaining({
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 86400000,
    }));
  });

  it('invalidates the cookie session on logout', async () => {
    authService.logout.mockResolvedValue({ message: 'Logged out' });
    const response = { clearCookie: jest.fn() };

    await expect(controller.logout({ headers: { cookie: `${SESSION_COOKIE}=session_1` } } as never, response as never))
      .resolves.toEqual({ message: 'Logged out' });
    expect(authService.logout).toHaveBeenCalledWith('session_1');
    expect(response.clearCookie).toHaveBeenCalledWith(SESSION_COOKIE, expect.objectContaining({ httpOnly: true, sameSite: 'lax' }));
  });
});