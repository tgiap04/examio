import { join } from 'path';
import { loadSync } from '@grpc/proto-loader';
import { PROTO_FILES } from '@examio/contracts';
import { IDEMPOTENT_RPCS, isIdempotentRpc } from './idempotent-rpcs';

const protoRoot = join(__dirname, '../../../proto');

function loadAllMethods(): string[] {
    const files = [
        ...new Set(Object.values(PROTO_FILES).map((p) => join(protoRoot, p.file))),
    ];
    const def = loadSync(files, { includeDirs: [protoRoot] });
    const out: string[] = [];
    for (const [svc, methods] of Object.entries(def)) {
        if ('format' in methods) continue; // message/enum type definition
        for (const m of Object.keys(methods)) out.push(`${svc}/${m}`);
    }
    return out;
}

describe('IDEMPOTENT_RPCS', () => {
    const all = loadAllMethods();

    it('every entry resolves to a method in the protos (no typos)', () => {
        const missing = [...IDEMPOTENT_RPCS].filter((r) => !all.includes(r));
        expect(missing).toEqual([]);
    });

    it('contains every Get*/List*/Find* RPC', () => {
        const reads = all.filter((r) => /\/(Get|List|Find)/.test(r));
        expect(reads.length).toBeGreaterThan(0);
        expect(reads.filter((r) => !isIdempotentRpc(r))).toEqual([]);
    });

    it('contains key-guarded money RPCs, DeleteObjects and GatewayControl/*', () => {
        for (const r of [
            'examio.finance.v1.WalletService/Debit',
            'examio.finance.v1.WalletService/Credit',
            'examio.finance.v1.WalletService/Refund',
            'examio.r2.v1.R2Service/DeleteObjects',
            'examio.gateway.v1.GatewayControl/RevokeSession',
            'examio.gateway.v1.GatewayControl/InvalidateUser',
            'examio.gateway.v1.GatewayControl/SetPageFlags',
        ]) {
            expect(isIdempotentRpc(r)).toBe(true);
        }
    });

    it('excludes UpdateBalance, UploadFile and every other mutation', () => {
        for (const r of [
            'examio.finance.v1.WalletService/UpdateBalance',
            'examio.finance.v1.WalletService/CreateWallet',
            'examio.r2.v1.R2Service/UploadFile',
            'examio.r2.v1.R2Service/DeleteFile',
            'examio.auth.v1.AuthService/SetUserRole',
            'examio.auth.v1.AuthService/SetSystemAdmin',
            'examio.auth.v1.AuthService/SetUserStatus',
        ]) {
            expect(isIdempotentRpc(r)).toBe(false);
        }
    });
});
