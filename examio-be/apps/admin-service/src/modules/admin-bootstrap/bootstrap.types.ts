/**
 * Result types for AdminBootstrapService.syncAdmins().
 *
 * Surfaced to the CLI command and any future HTTP admin endpoint.
 */
export type BootstrapAction =
    | 'create'
    | 'grant'
    | 'skip'
    | 'error';

export interface BootstrapEmailResult {
    email: string;
    action: BootstrapAction;
    userId?: string;
    error?: string;
}

export interface BootstrapResult {
    total: number;
    created: number;
    granted: number;
    skipped: number;
    errors: number;
    results: BootstrapEmailResult[];
}
