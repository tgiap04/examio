/** Shown where the backend returns `user: null` (auth unreachable or account deleted). */
export const DELETED_USER_LABEL = "Người dùng đã xóa";

export interface DisplayableUser {
  name?: string | null;
  username?: string | null;
}

/** Name for a possibly-null user from an exam / study-room response. */
export function displayUserName(user: DisplayableUser | null | undefined, fallback: string = DELETED_USER_LABEL): string {
  const name = user?.name?.trim();
  if (name) return name;
  const username = user?.username?.trim();
  return username || fallback;
}

export function displayUserInitial(user: DisplayableUser | null | undefined, fallback: string = DELETED_USER_LABEL): string {
  return displayUserName(user, fallback).charAt(0).toUpperCase();
}
