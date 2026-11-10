import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * `fixtures/route-inventory.json` is the public contract captured from the 208
 * hand-written proxy handlers (phase 01). They are gone; `route-coverage.spec.ts`
 * now proves `config/routes.yaml` serves every line. This spec only keeps the
 * fixture itself honest.
 */
const inventory: string[] = JSON.parse(
    readFileSync(join(__dirname, 'fixtures', 'route-inventory.json'), 'utf8')
);

describe('gateway route inventory fixture', () => {
    it('lists every route exactly once with a valid shape', () => {
        expect(inventory.length).toBeGreaterThan(50);
        expect(new Set(inventory).size).toBe(inventory.length);
        for (const line of inventory) {
            expect(line).toMatch(
                /^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD|ALL) \/api\/v1(\/[^\s]*)?$/
            );
        }
    });
});
