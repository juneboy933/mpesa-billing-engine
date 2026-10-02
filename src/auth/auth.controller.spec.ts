import { AuthController, SESSION_COOKIE } from './auth.controller';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: { signIn: jest.Mock; setPassword: jest.Mock; logout: jest.Mock };

  beforeEach(() => {
    authService = { signIn: jest.fn(), setPassword: jest.fn(), logout: jest.fn() };
    controller = new AuthController(authService as never);
  });

  it('creates an HttpOnly session cookie after password sign-in', async () => {
    authService.signIn.mockResolvedValue({ merchantId: 'm1', sessionId: 'session_1', expiresIn: 86400 });
    const response = { cookie: jest.fn() };
    await expect(controller.signIn({ phone: '0712345678', password: 'long-password' }, response as never)).resolves.toEqual({ merchantId: 'm1', expiresIn: 86400 });
    expect(response.cookie).toHaveBeenCalledWith(SESSION_COOKIE, 'session_1', expect.objectContaining({ httpOnly: true, maxAge: 86400000 }));
  });

  it('sets a password for the authenticated merchant', async () => {
    authService.setPassword.mockResolvedValue({ message: 'Password updated' });
    await expect(controller.setPassword({ merchant: { id: 'm1' } } as never, { password: 'a-long-password', currentPassword: 'old-password' })).resolves.toEqual({ message: 'Password updated' });
    expect(authService.setPassword).toHaveBeenCalledWith('m1', 'a-long-password', 'old-password');
  });

  it('clears and invalidates the current session on logout', async () => {
    authService.logout.mockResolvedValue({ message: 'Logged out' });
    const request = { headers: { cookie: `${SESSION_COOKIE}=session_1` } };
    const response = { clearCookie: jest.fn() };
    await expect(controller.logout(request as never, response as never)).resolves.toEqual({ message: 'Logged out' });
    expect(authService.logout).toHaveBeenCalledWith('session_1');
    expect(response.clearCookie).toHaveBeenCalledWith(SESSION_COOKIE, expect.objectContaining({ httpOnly: true }));
  });
});
