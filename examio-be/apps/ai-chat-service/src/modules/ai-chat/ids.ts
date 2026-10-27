/** Chat and message ids: base-36 timestamp plus a random suffix (kept from the exam ids). */
export function newId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}
