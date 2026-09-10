import { Test, TestingModule } from '@nestjs/testing';
import { DarajaService } from './daraja.service';

describe('DarajaService', () => {
  let service: DarajaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DarajaService],
    }).compile();

    service = module.get<DarajaService>(DarajaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
