import { Controller } from '@nestjs/common';
import { wordFamilyAdminV1 } from '@examio/contracts';
import { RequirePermissions } from '@examio/auth-jwt';
import { WordFamilyAdminService } from './word-family-admin.service';

/**
 * `examio.vocabulary.v1.WordFamilyAdminService`. The caller is admin-service
 * forwarding the admin's own token; `word_family:admin` is checked from that
 * token (no service-only shortcut).
 */
@Controller()
@wordFamilyAdminV1.WordFamilyAdminServiceControllerMethods()
export class WordFamilyAdminGrpcController
    implements wordFamilyAdminV1.WordFamilyAdminServiceController
{
    constructor(private readonly admin: WordFamilyAdminService) {}

    @RequirePermissions('word_family:admin')
    listCategories(req: wordFamilyAdminV1.ListCategoriesRequest) {
        return this.admin.listCategories(req);
    }

    @RequirePermissions('word_family:admin')
    upsertCategory(req: wordFamilyAdminV1.UpsertCategoryRequest) {
        return this.admin.upsertCategory(req);
    }

    @RequirePermissions('word_family:admin')
    deleteCategory(req: wordFamilyAdminV1.DeleteCategoryRequest) {
        return this.admin.deleteCategory(req);
    }
}
