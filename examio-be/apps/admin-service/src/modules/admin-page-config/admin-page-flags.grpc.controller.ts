import { Controller } from '@nestjs/common';
import { adminV1 } from '@examio/contracts';
import { ServiceOnly } from '@examio/auth-jwt';
import { AdminPageConfigService } from './admin-page-config.service';

/**
 * `AdminService.GetPageFlags`: the gateway pulls the current flags at boot when
 * its own Redis copy is empty. Service token (`aud = admin`) from `gateway` only.
 */
@Controller()
@adminV1.AdminServiceControllerMethods()
export class AdminPageFlagsGrpcController implements adminV1.AdminServiceController {
    constructor(private readonly pages: AdminPageConfigService) {}

    @ServiceOnly('gateway')
    async getPageFlags(): Promise<adminV1.GetPageFlagsResponse> {
        return { flags: await this.pages.getFlags() };
    }
}
