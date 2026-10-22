/**
 * The R2 object key behind a public URL, or `null` when the URL is not served
 * from our R2 public host (an external image is never ours to delete).
 */
export function r2KeyFromUrl(
    url: string | null | undefined,
    publicBase: string
): string | null {
    if (!url) return null;
    const base = publicBase.replace(/\/+$/, '');
    const prefix = `${base}/`;
    if (!url.startsWith(prefix)) return null;
    const key = url.slice(prefix.length);
    return key.length > 0 ? key : null;
}
