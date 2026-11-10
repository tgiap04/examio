import { resolveJobTimeoutMs } from './generation.constants';

describe('resolveJobTimeoutMs', () => {
    const warn = jest.fn();
    beforeEach(() => warn.mockClear());

    it('defaults to 60 minutes', () => {
        expect(resolveJobTimeoutMs({}, { warn })).toBe(60 * 60_000);
        expect(resolveJobTimeoutMs({ GENERATION_JOB_TIMEOUT_MINUTES: ' ' }, { warn })).toBe(60 * 60_000);
        expect(warn).not.toHaveBeenCalled();
    });

    it('takes a configured value of at least 10 minutes', () => {
        expect(resolveJobTimeoutMs({ GENERATION_JOB_TIMEOUT_MINUTES: '90' }, { warn })).toBe(90 * 60_000);
        expect(resolveJobTimeoutMs({ GENERATION_JOB_TIMEOUT_MINUTES: '10' }, { warn })).toBe(10 * 60_000);
    });

    it('warns and clamps a value below 10 minutes', () => {
        expect(resolveJobTimeoutMs({ GENERATION_JOB_TIMEOUT_MINUTES: '3' }, { warn })).toBe(10 * 60_000);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('below 10'));
    });

    it('warns and falls back on junk', () => {
        for (const v of ['abc', '0', '-5']) expect(resolveJobTimeoutMs({ GENERATION_JOB_TIMEOUT_MINUTES: v }, { warn })).toBe(60 * 60_000);
        expect(warn).toHaveBeenCalledTimes(3);
    });
});
