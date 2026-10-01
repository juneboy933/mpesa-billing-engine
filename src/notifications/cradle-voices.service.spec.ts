import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { CradleVoicesService } from './cradle-voices.service';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('CradleVoicesService', () => {
  let service: CradleVoicesService;
  let config: { get: jest.Mock };

  beforeEach(() => {
    config = { get: jest.fn() };
    config.get.mockImplementation((key: string) => ({
      CRADLE_URL: 'https://merchant.cradlevoices.com/',
      CRADLE_TOKEN: 'test-token',
    }[key]));
    service = new CradleVoicesService(config as unknown as ConfigService);
    jest.clearAllMocks();
  });

  it('sends an SMS batch and accepts a successful provider response', async () => {
    mockedAxios.post.mockResolvedValue({ status: 200, data: { accepted: true } });

    await expect(service.sendSms('Your NiaFlow code is 482913.', ['254768899729', '254794721042']))
      .resolves.toEqual({ accepted: true });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://merchant.cradlevoices.com/',
      {
        token: 'test-token',
        message: 'Your NiaFlow code is 482913.',
        phone: ['254768899729', '254794721042'],
      },
      { headers: { 'Content-Type': 'application/json' } },
    );
  });

  it('fails when provider configuration is incomplete', async () => {
    config.get.mockReturnValue(undefined);
    const incompleteService = new CradleVoicesService(config as unknown as ConfigService);

    await expect(incompleteService.sendSms('Message', ['254700000000']))
      .rejects.toThrow('Cradle Voices SMS configuration is incomplete');
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('propagates provider failures for the queue to retry', async () => {
    mockedAxios.post.mockRejectedValue(new Error('provider unavailable'));

    await expect(service.sendSms('Message', ['254700000000']))
      .rejects.toThrow('provider unavailable');
  });
});
