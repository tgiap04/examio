// Each entry: [pattern, replacement] — preserves context around sensitive data.
const PII_RULES: [RegExp, string][] = [
    // Email addresses
    [/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/g, '[REDACTED]'],
    // Bearer token — keep "Bearer " prefix, redact only the token value
    [/(Bearer\s+)[A-Za-z0-9\-._~+/]+=*/g, '$1[REDACTED]'],
    // Password JSON field — keep key, redact only the value
    [/("password"\s*:\s*")[^"]*(")/g, '$1[REDACTED]$2'],
    // JWT (3 base64url segments)
    [/eyJ[A-Za-z0-9\-._~+/]+=*\.[A-Za-z0-9\-._~+/]+=*\.[A-Za-z0-9\-._~+/]+=*/g, '[REDACTED]'],
];

/**
 * Mask common PII patterns from a single log line.
 * Patterns run sequentially against the line so the resulting
 * text still preserves surrounding context for operators.
 */
export function redactPII(line: string): string {
    let result = line;
    for (const [pattern, replacement] of PII_RULES) {
        result = result.replace(pattern, replacement);
    }
    return result;
}
