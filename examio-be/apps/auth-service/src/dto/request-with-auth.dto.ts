import { User } from '../prisma';
import type { AuthUser } from '@examio/auth-jwt';

/** `req.user` is the verified token principal; load other fields from the DB by id. */
export interface AuthenticatedRequest extends Request {
    user: AuthUser;
}

export interface AuthenticatedOauthRequest extends Request {
    user: {
        user: User;
        token?: string;
        sessionId?: string;
        refreshToken?: string;
    };
}
