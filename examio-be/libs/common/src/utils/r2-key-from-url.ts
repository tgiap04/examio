/**
 * Server-issued key segments come from r2-service `sanitizePathPart`
 * (`[A-Za-z0-9._-]`), so anything else cannot be one of our keys.
 */
const KEY_SEGMENT = /^[A-Za-z0-9._-]+$/;

function parseUrl(value: string): URL | null {
    try {
        return new URL(value);
    } catch {
        return null;
    }
}

/**
 * `R2_PUBLIC_URL` in the exact form a browser normalises it to (lower-case
 * scheme/host, default port dropped, path encoded), without a trailing slash.
 * Public URLs MUST be built from this, or `${base}/${key}` would never match the
 * `href === url` rule in {@link r2KeyFromUrl} and our own objects could not be
 * deleted.
 */
export function canonicalR2PublicBase(base: string): string {
    const parsed = parseUrl(base);
    return (parsed ? parsed.href : base).replace(/\/+$/, '');
}

/**
 * True when `url` names our R2 public hostname at all, whatever the scheme, port,
 * trailing-dot FQDN form or path: such a URL may reach our bucket, so it must
 * never be waved through as an external image.
 */
export function isR2Host(
    url: string | null | undefined,
    publicBase: string | undefined = process.env.R2_PUBLIC_URL
): boolean {
    if (!url || !publicBase) return false;
    const target = parseUrl(url);
    const base = parseUrl(publicBase);
    if (!target || !base) return false;
    const host = (h: string) => h.replace(/\.+$/, '');
    return host(target.hostname) === host(base.hostname);
}

/**
 * The object key behind a URL on our R2 public host, or `null` when the URL is
 * not served from that host. The URL is parsed the way a browser loads it
 * (case-folded scheme/host, default port dropped, tabs/newlines stripped, dot
 * segments resolved) and each path segment is percent-decoded, so the key is the
 * object a client would actually fetch. It is NOT validated: use
 * {@link r2KeyFromUrl} for anything that may be deleted.
 */
export function rawR2Key(
    url: string | null | undefined,
    publicBase: string | undefined = process.env.R2_PUBLIC_URL
): string | null {
    if (!url || !publicBase) return null;
    const target = parseUrl(url);
    const base = parseUrl(publicBase);
    if (!target || !base || target.origin !== base.origin) return null;
    const prefix = `${base.pathname.replace(/\/+$/, '')}/`;
    if (!target.pathname.startsWith(prefix)) return null;
    const encoded = target.pathname.slice(prefix.length);
    if (encoded.length === 0) return null;
    // A segment that decodes to something containing "/" (an encoded slash) or that
    // has a malformed escape is kept encoded, so it fails the canonical check
    // instead of silently adding a path level.
    return encoded
        .split('/')
        .map((segment) => {
            try {
                const decoded = decodeURIComponent(segment);
                return decoded.includes('/') ? segment : decoded;
            } catch {
                return segment;
            }
        })
        .join('/');
}

/**
 * True when every segment of `key` could have been issued by our server: no
 * empty, `.` or `..` segment and only `[A-Za-z0-9._-]` (so no `%`, `\`, spaces or
 * control characters a browser or proxy might reinterpret).
 */
export function isCanonicalR2Key(key: string): boolean {
    return key
        .split('/')
        .every((s) => s !== '.' && s !== '..' && KEY_SEGMENT.test(s));
}

/**
 * The R2 object key behind a public URL, or `null` when the URL is not served
 * from our R2 public host (an external image is never ours to delete), is not
 * already in the normalised form our server writes (no dot segments, encoding,
 * case or port variants), or the key is not canonical. Only exact server-issued
 * URLs are ever deletable.
 *
 * `publicBase` defaults to `R2_PUBLIC_URL`; with no base configured nothing
 * resolves, so a missing setting can never widen what gets deleted.
 */
export function r2KeyFromUrl(
    url: string | null | undefined,
    publicBase: string | undefined = process.env.R2_PUBLIC_URL
): string | null {
    if (!url || parseUrl(url)?.href !== url) return null;
    const key = rawR2Key(url, publicBase);
    return key !== null && isCanonicalR2Key(key) ? key : null;
}
