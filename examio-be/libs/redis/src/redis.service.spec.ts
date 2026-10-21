import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from './redis.service';

describe('RedisService', () => {
  let service: RedisService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RedisService],
    }).compile();

    service = module.get<RedisService>(RedisService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('onModuleDestroy swallows a rejected quit() (Redis unreachable at shutdown)', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (e: unknown) => unhandled.push(e);
    process.on('unhandledRejection', onUnhandled);
    const quit = jest.fn().mockRejectedValue(new Error('Connection is closed.'));
    (service as any).client = { quit };
    (service as any).subscriber = { quit };
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    service.onModuleDestroy();
    await new Promise((r) => setImmediate(r));
    process.off('unhandledRejection', onUnhandled);

    expect(quit).toHaveBeenCalledTimes(2);
    expect(unhandled).toEqual([]);
  });
});
