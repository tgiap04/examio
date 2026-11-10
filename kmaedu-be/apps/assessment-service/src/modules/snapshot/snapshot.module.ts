import { Global, Module } from '@nestjs/common';
import { SnapshotDrift } from './snapshot-drift';
import { SnapshotTaker } from './snapshot-taker';
import { SnapshotStore } from './snapshot.store';

/** One snapshot cache per process: the store is provided exactly once, here. */
@Global()
@Module({
    providers: [SnapshotStore, SnapshotTaker, SnapshotDrift],
    exports: [SnapshotStore, SnapshotTaker, SnapshotDrift],
})
export class SnapshotModule {}
