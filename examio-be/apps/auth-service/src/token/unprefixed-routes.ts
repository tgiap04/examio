/** Routes served outside the `api/v1` prefix (the gateway never routes either). */
export const AUTH_UNPREFIXED_ROUTES = [
    '.well-known/jwks.json',
    'internal/token',
] as const;
