import { User } from '../prisma';

/** The user row without its password hash (auth owns no wallet/subscription data any more). */
export function sanitizeUser(user: User): Omit<User, 'password'> {
    const { password, ...rest } = user;
    return rest;
}
