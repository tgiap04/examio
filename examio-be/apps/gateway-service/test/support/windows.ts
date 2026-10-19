/**
 * Rate limits are fixed windows aligned to the epoch. A test that needs N
 * requests to land in ONE window waits for the next window when too little of
 * the current one is left (at most `windowMs - leaveMs`, only in the last
 * stretch), so it never straddles a boundary.
 */
export async function alignToWindow(windowMs: number, needMs: number): Promise<void> {
    const left = windowMs - (Date.now() % windowMs);
    if (left < needMs) await new Promise((resolve) => setTimeout(resolve, left + 50));
}
