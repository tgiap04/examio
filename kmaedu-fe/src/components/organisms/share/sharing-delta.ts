import type {
  SharingDelta,
  SharingPerson,
  SharingView,
} from "@/lib/quiz-practice/sharing-types";

export interface WhitelistChange {
  /** People newly picked (not on the saved whitelist). */
  added: SharingPerson[];
  /** Saved whitelist ids the teacher took off. */
  removed: string[];
}

export const NO_WHITELIST_CHANGE: WhitelistChange = { added: [], removed: [] };

/** The list the picker shows: saved people minus the removed ones, plus the added ones. */
export function visibleWhitelist(
  saved: SharingPerson[],
  change: WhitelistChange,
): SharingPerson[] {
  const gone = new Set(change.removed);
  return [...saved.filter((p) => !gone.has(p.id)), ...change.added];
}

/** Picks `person`: re-adding someone just removed cancels the removal. */
export function addPerson(
  change: WhitelistChange,
  saved: SharingPerson[],
  person: SharingPerson,
): WhitelistChange {
  if (visibleWhitelist(saved, change).some((p) => p.id === person.id)) return change;
  if (saved.some((p) => p.id === person.id)) {
    return { ...change, removed: change.removed.filter((id) => id !== person.id) };
  }
  return { ...change, added: [...change.added, person] };
}

export function removePerson(change: WhitelistChange, saved: SharingPerson[], id: string): WhitelistChange {
  if (change.added.some((p) => p.id === id)) {
    return { ...change, added: change.added.filter((p) => p.id !== id) };
  }
  return saved.some((p) => p.id === id) && !change.removed.includes(id)
    ? { ...change, removed: [...change.removed, id] }
    : change;
}

export interface EditedSharing {
  isPublic: boolean;
  codeEnabled: boolean;
  whitelist: WhitelistChange;
  /** Code-granted users the teacher took off (only their code unlock is revoked). */
  removedCodeGranted: string[];
}

/** One `PUT` body holding only what changed; `null` when nothing did. */
export function buildSharingDelta(saved: SharingView, edited: EditedSharing): SharingDelta | null {
  const delta: SharingDelta = {};
  if (edited.isPublic !== saved.isPublic) delta.isPublic = edited.isPublic;
  if (edited.codeEnabled !== (saved.accessCode !== null)) delta.codeEnabled = edited.codeEnabled;
  if (edited.whitelist.added.length > 0) delta.addUserIds = edited.whitelist.added.map((p) => p.id);
  // Two separate lists: taking someone off the code list must never touch their whitelist grant.
  if (edited.whitelist.removed.length > 0) delta.removeUserIds = edited.whitelist.removed;
  if (edited.removedCodeGranted.length > 0) delta.removeCodeGrantedIds = edited.removedCodeGranted;
  return Object.keys(delta).length > 0 ? delta : null;
}
