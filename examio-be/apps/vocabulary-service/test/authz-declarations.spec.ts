import 'reflect-metadata';
import {
    collectControllers,
    routeHandlers,
    undeclaredHandlers,
} from '@examio/auth-jwt/testing';
import { VocabularyServiceModule } from '../src/vocabulary-service.module';

describe('vocabulary-service authz declarations (deny by default)', () => {
    const controllers = collectControllers(VocabularyServiceModule);
    const handlers = controllers.flatMap((c) => routeHandlers(c));

    it('finds the HTTP controller and both gRPC controllers', () => {
        expect(controllers.map((c) => c.name)).toEqual(
            expect.arrayContaining([
                'WordFamilyController',
                'WordFamilyAdminGrpcController',
                'WordFamilyGrpcController',
            ])
        );
    });

    it('scans HTTP handlers and the 3 + 1 gRPC handlers', () => {
        expect(handlers.filter((h) => h.kind === 'http').length).toBeGreaterThanOrEqual(10);
        const rpc = handlers.filter((h) => h.kind === 'rpc').map((h) => `${h.controller}.${h.handler}`);
        expect(rpc.sort()).toEqual([
            'WordFamilyAdminGrpcController.deleteCategory',
            'WordFamilyAdminGrpcController.listCategories',
            'WordFamilyAdminGrpcController.upsertCategory',
            'WordFamilyGrpcController.getWordFamily',
        ]);
    });

    it('every HTTP and gRPC handler declares exactly its authz decorator', () => {
        expect(undeclaredHandlers(controllers)).toEqual([]);
    });
});
