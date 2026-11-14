/**
 * State events (not facts) carry a monotonic version so consumers can drop
 * stale, reordered deliveries. The version lives at `data.version`, except for
 * the authz event where `data.authzVersion` is the version.
 */
export type StateVersionField = 'version' | 'authzVersion';

export const STATE_EVENT_TYPES: ReadonlyMap<string, StateVersionField> =
    new Map([['auth.user.authz_changed', 'authzVersion']]);

/**
 * Every `*.updated`, `*.changed` and `*.<word>_changed` (e.g. `authz_changed`)
 * type is a state event by convention.
 */
const STATE_SUFFIX = /\.(updated|(?:[a-z0-9]+_)*changed)$/;

export function stateVersionField(type: string): StateVersionField | null {
    const registered = STATE_EVENT_TYPES.get(type);
    if (registered) return registered;
    return STATE_SUFFIX.test(type) ? 'version' : null;
}
