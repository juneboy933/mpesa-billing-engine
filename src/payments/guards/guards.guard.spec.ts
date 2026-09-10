import { WebhookGuard } from './webhook.guard';

describe('GuardsGuard', () => {
  it('should be defined', () => {
    const mockExecutionContext = {} as any;
    const mockCallHandler = { handle: () => ({ subscribe: () => {} }) } as any;
    expect(new WebhookGuard().canActivate(mockExecutionContext, mockCallHandler)).toBeDefined();
  });
});
