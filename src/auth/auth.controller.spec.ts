import { AuthController, SESSION_COOKIE } from './auth.controller';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: { requestOtp: jest.Mock; verifyOtp: jest.Mock; logout: jest.Mock };

  beforeEach(() => {
    authService = { requestOtp: jest.fn(), verifyOtp: jest.fn(), logout: jest.fn() };
    controller = new AuthController(authService as never);
  });

  it('creates an HttpOnly session cookie after OTP verification', async () => {
    authService.verifyOtp.mockResolvedValue({ merchantId: 'm1', sessionId: 'session_1', expiresIn: 86400 });
    const response = { cookie: jest.fn() };

    await expect(controller.verifyOtp({ phone: '0712345678', code: '482913' }, response as never))
      .resolves.toEqual({ merchantId: 'm1', expiresIn: 86400 });
    expect(response.cookie).toHaveBeenCalledWith(SESSION_COOKIE, 'session_1', expect.objectContaining({
      httpOnly: true,
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 86400000,
    }));
  });

  it('sets a secure cross-site cookie for the separately hosted production web app', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    authService.verifyOtp.mockResolvedValue({ merchantId: 'm1', sessionId: 'session_1', expiresIn: 86400 });
    const response = { cookie: jest.fn() };

    try {
      await controller.verifyOtp({ phone: '0712345678', code: '482913' }, response as never);

      expect(response.cookie).toHaveBeenCalledWith(SESSION_COOKIE, 'session_1', expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'none',
      }));
    } finally {
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('invalidates the cookie session on logout', async () => {
    authService.logout.mockResolvedValue({ message: 'Logged out' });
    const response = { clearCookie: jest.fn() };

    await expect(controller.logout({ headers: { cookie: `${SESSION_COOKIE}=session_1` } } as never, response as never))
      .resolves.toEqual({ message: 'Logged out' });
    expect(authService.logout).toHaveBeenCalledWith('session_1');
    expect(response.clearCookie).toHaveBeenCalledWith(SESSION_COOKIE, expect.objectContaining({ httpOnly: true, sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax' }));
  });
});
