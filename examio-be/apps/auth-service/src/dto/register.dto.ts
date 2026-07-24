import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { ApiProperty } from '@nestjs/swagger';

export const RegisterSchema = z.object({
    username: z
        .string()
        .min(3, { message: 'Username must be at least 3 characters long' })
        .max(20, { message: 'Username must not exceed 20 characters' }),
    email: z
        .string()
        .email({ message: 'Invalid email address' })
        .max(50, { message: 'Email must not exceed 50 characters' }),
    password: z
        .string()
        .min(8, { message: 'Password must be at least 8 characters long' })
        .max(100, { message: 'Password must not exceed 100 characters' }),
    turnstileToken: z.string().optional(),
    utmSource: z
        .string()
        .trim()
        .max(64)
        .regex(/^[\w.-]+$/, { message: 'Invalid utm_source' })
        .optional(),
});

export class RegisterDto extends createZodDto(RegisterSchema) {
    @ApiProperty({
        description: 'Username of the user',
        example: 'jodn_123',
    })
    username: string;

    @ApiProperty({
        description: 'Email address of the user',
        example: 'example@gmail.com',
    })
    email: string;

    @ApiProperty({
        description: 'Password for the user account',
        example: 'password123',
    })
    password: string;

    @ApiProperty({
        description: 'Cloudflare Turnstile token for bot protection',
        required: false,
    })
    turnstileToken?: string;

    @ApiProperty({
        description: 'utm_source first-touch để quy kết nguồn đăng ký',
        required: false,
        example: 'unikorn',
    })
    utmSource?: string;
}
