import { ArgumentsHost, BadRequestException, HttpException } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { firstValueFrom, Observable } from 'rxjs';
import { HttpErrorEnvelopeFilter } from './http-error-envelope.filter';

function host(headers: Record<string, string> = {}) {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const h = {
        getType: () => 'http',
        switchToHttp: () => ({
            getRequest: () => ({ headers }),
            getResponse: () => ({ status }),
        }),
    } as unknown as ArgumentsHost;
    return { h, status, json };
}

describe('HttpErrorEnvelopeFilter', () => {
    const filter = new HttpErrorEnvelopeFilter();

    it('takes requestId from x-request-id', () => {
        const { h, json } = host({ 'x-request-id': 'req_abc' });
        filter.catch(new HttpException('nope', 404), h);
        expect(json).toHaveBeenCalledWith({
            statusCode: 404,
            code: 'NOT_FOUND',
            message: 'nope',
            requestId: 'req_abc',
        });
    });

    it('keeps an explicit code from HttpException({ statusCode, code, message })', () => {
        const { h, json, status } = host({ 'x-request-id': 'r1' });
        filter.catch(
            new HttpException(
                { statusCode: 422, code: 'INSUFFICIENT_BALANCE', message: 'Số dư không đủ' },
                422
            ),
            h
        );
        expect(status).toHaveBeenCalledWith(422);
        expect(json).toHaveBeenCalledWith({
            statusCode: 422,
            code: 'INSUFFICIENT_BALANCE',
            message: 'Số dư không đủ',
            requestId: 'r1',
        });
    });

    it('joins class-validator message arrays', () => {
        const { h, json } = host({ 'x-request-id': 'r2' });
        filter.catch(new BadRequestException(['a must be x', 'b must be y']), h);
        expect(json).toHaveBeenCalledWith(
            expect.objectContaining({
                statusCode: 400,
                code: 'BAD_REQUEST',
                message: 'a must be x; b must be y',
            })
        );
    });

    it('maps unknown errors to 500 INTERNAL_SERVER_ERROR without leaking details', () => {
        const { h, json, status } = host();
        filter.catch(new Error('db password is hunter2'), h);
        expect(status).toHaveBeenCalledWith(500);
        const body = json.mock.calls[0][0];
        expect(body).toMatchObject({
            statusCode: 500,
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Internal server error',
        });
        expect(typeof body.requestId).toBe('string');
        expect(JSON.stringify(body)).not.toContain('hunter2');
    });

    describe('non-HTTP contexts (hybrid gRPC apps inherit global filters)', () => {
        const rpc = { getType: () => 'rpc' } as unknown as ArgumentsHost;
        const rejection = (error: unknown) =>
            firstValueFrom(filter.catch(error, rpc) as unknown as Observable<never>).catch((e) => e);

        it('keeps the RpcException payload (gRPC status code) intact', async () => {
            await expect(
                rejection(new RpcException({ code: 7, message: 'PERMISSION_DENIED' }))
            ).resolves.toEqual({ code: 7, message: 'PERMISSION_DENIED' });
        });

        it('answers an unexpected error the way Nest does by default', async () => {
            const result = await rejection(new Error('boom'));
            expect(result).toMatchObject({ status: 'error', message: 'Internal server error' });
        });
    });

    it('generates a requestId when the header is missing', () => {
        const { h, json } = host();
        filter.catch(new HttpException('x', 400), h);
        expect(json.mock.calls[0][0].requestId).toMatch(/^req_/);
    });
});
