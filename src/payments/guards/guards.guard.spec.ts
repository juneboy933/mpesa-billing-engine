import { ConfigService } from '@nestjs/config';
import { WebhookGuard } from './webhook.guard';

describe('GuardsGuard', () => {
  it('should be defined', () => {
    const mockConfig = { get: jest.fn().mockReturnValue('valid-token') } as unknown as ConfigService;
    const mockExecutionContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          params: { token: 'valid-token' },
        }),
      }),
    } as any;
    const mockCallHandler = { handle: () => ({ subscribe: () => {} }) } as any;

    const guard = new WebhookGuard(mockConfig);
    expect(guard.canActivate(mockExecutionContext, mockCallHandler)).toBe(true);
  });
});
