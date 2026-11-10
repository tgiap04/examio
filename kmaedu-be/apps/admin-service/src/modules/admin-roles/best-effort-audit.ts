import type { Logger } from '@nestjs/common';
import type { AuditWriteInput, AuditWriterService } from '../../common/audit-writer.service';

/**
 * AdminAudit write AFTER an auth RPC has committed: the change is already done
 * (auth's RoleChangeLog is the durable record), so a failing audit insert must
 * not turn a successful change into an error response. It is logged loudly.
 */
export async function writeAuditBestEffort(
    audit: AuditWriterService,
    logger: Logger,
    input: AuditWriteInput
): Promise<void> {
    try {
        await audit.write(input);
    } catch (err) {
        logger.error(
            `AdminAudit write failed after a committed change: userId=${input.targetId ?? 'n/a'} action=${input.action} admin=${input.adminId}: ${
                err instanceof Error ? err.message : String(err)
            }`
        );
    }
}
