import { Metadata } from '@grpc/grpc-js';
import { GRPC_METADATA_ATTACHER, buildMetadata, redactMetadata } from './metadata';

describe('buildMetadata', () => {
    it('sets x-request-id (generated when absent) and authorization', () => {
        const md = buildMetadata({ authorization: 'Bearer abc', requestId: 'req_1' });
        expect(md.get('x-request-id')).toEqual(['req_1']);
        expect(md.get('authorization')).toEqual(['Bearer abc']);
        expect(buildMetadata().get('x-request-id')[0]).toMatch(/^req_/);
        expect(buildMetadata().get('authorization')).toEqual([]);
    });
});

describe('redactMetadata', () => {
    it('redacts authorization and passes everything else through', () => {
        const md = new Metadata();
        md.set('authorization', 'Bearer secret-token');
        md.set('x-request-id', 'req_9');
        const out = redactMetadata(md);
        expect(out).toEqual({ authorization: '[redacted]', 'x-request-id': 'req_9' });
        expect(JSON.stringify(out)).not.toContain('secret-token');
    });
});

describe('GRPC_METADATA_ATTACHER', () => {
    it('keeps the DI token value services inject by', () => {
        expect(GRPC_METADATA_ATTACHER).toBe('GRPC_METADATA_ATTACHER');
    });
});
