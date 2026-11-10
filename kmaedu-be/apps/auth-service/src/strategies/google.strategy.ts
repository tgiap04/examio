import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback, StrategyOptionsWithRequest } from 'passport-google-oauth20';
import { Request } from 'express';
import { AuthService } from '../auth.service';
import { extractUtmSourceFromState } from '../utils/utm-source.util';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
    constructor(private authService: AuthService) {
        super({
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: process.env.GOOGLE_CALLBACK_URL,
            scope: ['email', 'profile'],
            passReqToCallback: true,
        } as unknown as StrategyOptionsWithRequest);
    }

    async validate(
        req: Request,
        accessToken: string,
        refreshToken: string,
        profile: any,
        done: VerifyCallback
    ): Promise<any> {
        const { name, emails, photos } = profile;
        const user = {
            email: emails[0].value,
            firstName: name.givenName,
            lastName: name.familyName,
            picture: photos[0].value,
            accessToken,
        };

        // utm_source đi kèm trong OAuth `state` (base64url JSON) mà Google trả về
        // — rút ra để quy kết nguồn khi tạo user mới (first-touch).
        const utmSource = extractUtmSourceFromState(req.query?.state);
        const result = await this.authService.googleLogin(
            user,
            undefined,
            utmSource
        );
        done(null, result);
    }
}
