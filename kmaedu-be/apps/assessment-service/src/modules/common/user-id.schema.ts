import { z } from 'zod';

/** A user id as every service in the app stores and compares it (auth's ids are short opaque strings). */
export const userIdSchema = z.string().min(1).max(64);
