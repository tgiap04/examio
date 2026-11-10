import 'reflect-metadata';
import {
    collectControllers,
    routeHandlers,
    undeclaredHandlers,
} from '@examio/auth-jwt/testing';
import { declarationOf } from '@examio/auth-jwt';
import { DocumentServiceModule } from '../src/document-service.module';

describe('document-service authz declarations (deny by default)', () => {
    const controllers = collectControllers(DocumentServiceModule);
    // The shared health probes (live/ready) are public by design; every other handler is under test.
    const handlers = controllers.filter((c) => c.name !== 'HealthController').flatMap((c) => routeHandlers(c));

    it('finds the upload, image and gRPC controllers', () => {
        expect(controllers.map((c) => c.name)).toEqual(
            expect.arrayContaining(['UploadController', 'R2ImageController', 'DocumentGrpcController'])
        );
    });

    it('scans the 6 HTTP routes and the 8 DocumentService RPCs', () => {
        const http = handlers.filter((h) => h.kind === 'http').map((h) => `${h.controller}.${h.handler}`);
        expect(http.sort()).toEqual([
            'R2ImageController.uploadImage',
            'UploadController.createUpload',
            'UploadController.deleteUpload',
            'UploadController.quickUpload',
            'UploadController.uploadDetail',
            'UploadController.uploadImage',
        ]);
        const rpc = handlers.filter((h) => h.kind === 'rpc').map((h) => h.handler);
        expect(rpc.sort()).toEqual([
            'assertOwnership',
            'createUpload',
            'deleteDocuments',
            'ensureProcessed',
            'getDocumentsByIds',
            'getDownloadUrl',
            'getQuota',
            'listDocuments',
        ]);
    });

    it('every HTTP and gRPC handler declares exactly its authz decorator', () => {
        expect(undeclaredHandlers(controllers)).toEqual([]);
    });

    it('every HTTP route needs document:upload and no plain @Authenticated() exists', () => {
        const declared = (controllerName: string, handler: string) => {
            const controller = controllers.find((c) => c.name === controllerName)!;
            const fn = (controller.prototype as Record<string, object>)[handler];
            return declarationOf(<T>(key: string) => Reflect.getMetadata(key, fn) as T | undefined);
        };
        for (const h of handlers.filter((x) => x.kind === 'http')) {
            expect([h.handler, declared(h.controller, h.handler)]).toEqual([
                h.handler,
                { kind: 'permissions', permissions: ['document:upload'] },
            ]);
        }
    });

    it('no DocumentService RPC lets a service token act for a user', () => {
        const controller = controllers.find((c) => c.name === 'DocumentGrpcController')!;
        for (const h of handlers.filter((x) => x.kind === 'rpc')) {
            const fn = (controller.prototype as Record<string, object>)[h.handler];
            const d = declarationOf(<T>(key: string) => Reflect.getMetadata(key, fn) as T | undefined);
            const servicesAllowed = d?.kind === 'service-only' || (d?.kind === 'permissions-or-service' && d.callers?.length !== 0);
            expect([h.handler, servicesAllowed]).toEqual([h.handler, false]);
        }
    });
});
