import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Metadata } from '@grpc/grpc-js';
import type { Observable } from 'rxjs';
import { PROTO_FILES, wordFamilyAdminV1 } from '@kmaedu/contracts';
import {
    CallOptions,
    GrpcClientRegistration,
    grpcErrorToHttpException,
    invokeRpc,
} from '@kmaedu/grpc';

export const VOCABULARY_GRPC = 'VOCABULARY_GRPC';

/** Served by vocabulary-service (`VOCABULARY_GRPC_URL`). */
export const VOCABULARY_GRPC_REGISTRATION: GrpcClientRegistration = {
    name: VOCABULARY_GRPC,
    pkg: PROTO_FILES.wordFamilyAdmin.pkg,
    protoFile: PROTO_FILES.wordFamilyAdmin.file,
    urlEnv: 'VOCABULARY_GRPC_URL',
};

const RPC = `${PROTO_FILES.wordFamilyAdmin.pkg}.${wordFamilyAdminV1.WORD_FAMILY_ADMIN_SERVICE_NAME}`;

/** admin -> WordFamilyAdminService with the calling admin's token (`word_family:admin`). */
@Injectable()
export class VocabularyClient implements OnModuleInit {
    private svc!: wordFamilyAdminV1.WordFamilyAdminServiceClient;

    constructor(@Inject(VOCABULARY_GRPC) private readonly client: ClientGrpc) {}

    onModuleInit(): void {
        this.svc = this.client.getService<wordFamilyAdminV1.WordFamilyAdminServiceClient>(
            wordFamilyAdminV1.WORD_FAMILY_ADMIN_SERVICE_NAME
        );
    }

    listCategories(req: wordFamilyAdminV1.ListCategoriesRequest, md: Metadata) {
        return this.call('ListCategories', (o) => this.svc.listCategories(req, md, o));
    }

    upsertCategory(req: wordFamilyAdminV1.UpsertCategoryRequest, md: Metadata) {
        return this.call('UpsertCategory', (o) => this.svc.upsertCategory(req, md, o));
    }

    deleteCategory(req: wordFamilyAdminV1.DeleteCategoryRequest, md: Metadata) {
        return this.call('DeleteCategory', (o) => this.svc.deleteCategory(req, md, o));
    }

    private async call<T>(
        method: string,
        invoke: (options: CallOptions) => Observable<T>
    ): Promise<T> {
        try {
            return await invokeRpc(`${RPC}/${method}`, invoke);
        } catch (err) {
            throw grpcErrorToHttpException(err);
        }
    }
}
