import { Injectable } from '@nestjs/common';
import { ConfigService, type PageFlagMap } from '../services/config.service';

/** Default-on: a page is blocked only when its flag is explicitly `false`. */
export function isPageEnabled(flags: PageFlagMap, key: string): boolean {
    return flags[key] !== false;
}

/** Page flags as the guard chain sees them (shares the cache `ConfigService` serves to the FE). */
@Injectable()
export class PageFlagCheck {
    constructor(private readonly config: ConfigService) {}

    async isEnabled(flag: string): Promise<boolean> {
        return isPageEnabled(await this.config.getPages(), flag);
    }
}
