/** Shapes of the quiz set / flashcard set sharing API (same contract for both). */
export interface SharingPerson {
  id: string;
  username: string;
  name: string | null;
  avatar: string | null;
}

export interface SharingView {
  isPublic: boolean;
  accessCode: string | null;
  whitelist: SharingPerson[];
  codeGranted: SharingPerson[];
}

/** Body of `PUT :id/sharing`; at least one field. Arrays hold at most 2000 ids. */
export interface SharingDelta {
  addUserIds?: string[];
  /** Takes the user off the whitelist AND the code-granted list. */
  removeUserIds?: string[];
  /** Revokes a code unlock only; the whitelist grant stays. */
  removeCodeGrantedIds?: string[];
  isPublic?: boolean;
  codeEnabled?: boolean;
}

/** `GET users/search`: no email is returned any more. */
export type SharingSearchUser = SharingPerson;
