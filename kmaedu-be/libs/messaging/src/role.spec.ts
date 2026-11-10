import { parseRoles } from './role';

describe('parseRoles', () => {
    it('defaults to api and worker', () => {
        expect([...parseRoles(undefined)].sort()).toEqual(['api', 'worker']);
        expect([...parseRoles('')].sort()).toEqual(['api', 'worker']);
    });

    it('parses single and combined roles, ignoring spaces and case', () => {
        expect([...parseRoles('api')]).toEqual(['api']);
        expect([...parseRoles('worker')]).toEqual(['worker']);
        expect([...parseRoles(' API , Worker ')].sort()).toEqual(['api', 'worker']);
    });

    it('rejects an unknown role instead of silently running nothing', () => {
        expect(() => parseRoles('api,cron')).toThrow(/ROLE/);
    });
});
