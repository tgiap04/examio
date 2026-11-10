import { ConfigController } from './config.controller';
import { ConfigService } from '../services/config.service';

const controllerFor = (map: Record<string, boolean>) =>
    new ConfigController({ getPages: async () => map } as unknown as ConfigService);

describe('ConfigController GET /config/pages', () => {
    it('serves an empty list (the FE reads that as every page enabled) when no flags exist yet', async () => {
        await expect(controllerFor({}).getPages()).resolves.toEqual({ pages: [] });
    });

    it('serves each stored flag as { key, enabled }', async () => {
        await expect(controllerFor({ a: false, b: true }).getPages()).resolves.toEqual({
            pages: [
                { key: 'a', enabled: false },
                { key: 'b', enabled: true },
            ],
        });
    });
});
