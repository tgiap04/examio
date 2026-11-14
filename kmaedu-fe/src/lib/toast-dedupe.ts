/**
 * One denied action must show one toast: the axios interceptor toasts the
 * denial and the caller's catch block usually re-toasts `error.message`.
 * Identical keys inside the window collapse into the first toast.
 */
export interface ToastDeduper<T> {
  (key: string, create: () => T): T;
  /** Keys still inside their window (diagnostics / tests). */
  size: () => number;
}

interface Entry<T> {
  at: number;
  handle: T;
}

export function createToastDeduper<T>(windowMs = 3000, now: () => number = () => Date.now()): ToastDeduper<T> {
  const seen = new Map<string, Entry<T>>();

  const prune = (t: number) => {
    for (const [key, entry] of seen) {
      if (t - entry.at >= windowMs) seen.delete(key);
    }
  };

  const run = ((key: string, create: () => T): T => {
    const t = now();
    prune(t);
    const hit = seen.get(key);
    if (hit) return hit.handle;
    const handle = create();
    seen.set(key, { at: t, handle });
    return handle;
  }) as ToastDeduper<T>;
  run.size = () => seen.size;
  return run;
}
