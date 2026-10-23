import { Controller } from '@nestjs/common';
import { wordFamilyV1 } from '@examio/contracts';
import { RequirePermissionsOrService } from '@examio/auth-jwt';
import { WordFamilyLookupService } from './word-family-lookup.service';

/**
 * `examio.vocabulary.v1.WordFamilyService`. Word families are shared catalog
 * rows (no owner), so any verified user token or any service token may read.
 */
@Controller()
@wordFamilyV1.WordFamilyServiceControllerMethods()
export class WordFamilyGrpcController implements wordFamilyV1.WordFamilyServiceController {
    constructor(private readonly lookup: WordFamilyLookupService) {}

    @RequirePermissionsOrService([])
    getWordFamily(req: wordFamilyV1.GetWordFamilyRequest) {
        return this.lookup.getWordFamily(req.id);
    }
}
