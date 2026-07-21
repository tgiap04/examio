# Phase 01 — Prisma Models (playlist / access / moderation / block)

## Context Links
- Plan: [plan.md](plan.md) · Decisions: [clarifications.md](clarifications.md)
- Model gốc: `examio-be/libs/database/src/models/study-room.prisma` (StudyRoom, StudyRoomMember)
- Mirror access: `ExamSession` (assessType Int, whitelist String[], accessCode)
- **Model tách file + generate qua prisma-merge** — sửa `models/*.prisma`, KHÔNG sửa schema.prisma trực tiếp.

## Overview
- **Priority:** High · **Status:** pending
- Thêm cấu hình access + playlist add-permission vào StudyRoom; cờ moderation vào StudyRoomMember; 2 bảng mới (playlist item, chat block).

## Implementation Steps
1. Sửa `models/study-room.prisma`:

```prisma
model StudyRoom {
    // ...giữ nguyên các field cũ...
    accessType            Int      @default(0) // 0 PUBLIC(auth) | 1 CODE | 2 WHITELIST
    whitelist             String[] @default([]) // userId cho accessType=2
    playlistAddPermission Int      @default(1) // 0 EVERYONE | 1 COHOST+ | 2 HOST
    // relations mới:
    playlist StudyRoomPlaylistItem[]
}

model StudyRoomMember {
    // ...giữ nguyên...
    isBanned Boolean @default(false)
    isMuted  Boolean @default(false)
}

model StudyRoomPlaylistItem {
    id            String   @id @default(cuid())
    studyRoomId   String
    url           String
    kind          Int      @default(0) // 0 VIDEO | 1 PLAYLIST
    title         String?
    addedByUserId String
    order         Int      @default(0)
    createdAt     DateTime @default(now())

    studyRoom StudyRoom @relation(fields: [studyRoomId], references: [id], onDelete: Cascade)

    @@index([studyRoomId, order])
}

model StudyRoomChatBlock {
    id          String   @id @default(cuid())
    studyRoomId String
    blockerId   String   // user chặn
    blockedId   String   // user bị chặn
    createdAt   DateTime @default(now())

    @@unique([studyRoomId, blockerId, blockedId])
    @@index([studyRoomId, blockerId])
}
```

2. `yarn prisma:merge && yarn prisma:generate`.
3. Migration: KHÔNG dùng `migrate dev` (DB remote dùng chung, 2 migration cũ chưa apply + migration tiền tệ float→int rủi ro). Sinh SQL additive rồi apply thủ công qua psql trong 1 transaction (đúng cách đã làm cho bảng StudyRoom trước). SQL chỉ gồm ALTER ADD COLUMN + CREATE TABLE/INDEX — không đụng dữ liệu cũ.
4. `yarn build` (exam-service) xác nhận type mới OK.

## Todo
- [ ] StudyRoom: accessType, whitelist, playlistAddPermission
- [ ] StudyRoomMember: isBanned, isMuted
- [ ] StudyRoomPlaylistItem + StudyRoomChatBlock
- [ ] merge + generate + build
- [ ] Apply SQL additive lên DB (transaction, không đụng float→int)

## Success Criteria
- Prisma client sinh type mới; build xanh; bảng/cột mới có trên DB (verify `\d`).

## Risk
- Chỉ THÊM (ADD COLUMN có default / CREATE TABLE) — không sửa/xoá cột cũ → an toàn dữ liệu.
