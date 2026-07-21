# Study-Room Playlist, Access Modes & Moderation — Implementation Complete

**Date**: 2026-07-21 20:57
**Severity**: High (plan risk materialized, caught in review)
**Component**: Backend: exam-service study-room module + gateway WS; Frontend: room UI panels
**Status**: Complete (124 tests pass, 5 suites; NOT committed—awaiting user diff seal)

## What Happened

Extended Study-Together Room with five features: (1) YouTube PLAYLIST — ordered queue (StudyRoomPlaylistItem table, 100-item cap, server-authoritative auto-advance driven by leader client on media:ended); (2) ACCESS MODES — StudyRoom.accessType [0=PUBLIC/1=CODE/2=WHITELIST], new POST /studyrooms/:id/join; (3) MODERATION — ban (cross-instance rejection via Socket.io Redis adapter) + mute (room-wide), enforced by HOST/COHOST, cannot touch equal/higher rank; (4) PERSONAL CHAT BLOCK — StudyRoomChatBlock table, server-persisted + client-filtered; (5) FE: playlist-panel, room-access-settings, roster block/ban/mute, youtube-sync-player with leader-only media:ended.

## The Brutal Truth

Plan Risk #1 was left live in code: **leader-disconnect didn't re-broadcast leadership**. If host closed laptop mid-video, the playlist would freeze (no new leader = no media:ended events). Humbling—the plan *named* it, but nobody coded the mitigation. Reviewer caught it. Stung by shipping incomplete mitigation. Also: tester found two legacy remove-before-current tests encoded old semantics; updated them.

## Technical Details

- DB: single transaction psql session, isolated from pre-existing migration drift.
- Leader election: on leave, `countMembers` excludes banned members; earliest-online member elected via Socket.io event + broadcast.
- Media sync: playlist cap 100, media:ended throttled, cohost next/prev. Removal before current no longer restarts playback.
- Access: JOIN endpoint validates code/whitelist server-side; POST returns token good for upgrade.

## Root Cause Analysis

Plan risks are documentation debt, not implementation debt. Named in risk matrix but not wired into code review checklist. The happy-path media:ended handler *worked*; nobody verified the edge case (leader drop) was closed. Lesson: a stated risk stays open until there's code + test proving it.

## Lessons Learned

1. Plan risks ≠ resolved risks — verify each is actually closed with code, not just listed in discussion.
2. Tester-authored tests encode expected behavior — update both code and test when correcting semantics, or risk silent contract drift.

## Next Steps

- Generate real migration file for schema changes before clean-slate deploy.
- Gateway-level auth tests (M4 backlog).
- User reviews diff, seals it, approves commit.

---

**Status**: DONE
**Summary**: Playlist, access control, and moderation fully shipped with 124 passing tests. Plan risk #1 (leader-disconnect) caught in review and fixed. Migration applied to remote DB; code migration file pending. Not committed.
