# Phase 01 — Prisma StudyRoom Models

## Context Links

- Plan: [plan.md](plan.md) · Decisions: [clarifications.md](clarifications.md)
- Schema: `examio-be/libs/database/src/schema.prisma`
- Pattern tham chiếu: `ExamRoom` (schema.prisma:250) — hostId + relations; `ExamSession.accessCode` (schema.prisma:280, 6 số, indexed)

## Overview

- **Priority:** High · **Status:** pending
- Thêm 2 model mới cho phòng học chung. KHÔNG có model chat (ephemeral Redis). Live state (timer/media/presence) KHÔNG nằm trong DB.

## Requirements

- `StudyRoom`: cấu hình phòng bền theo host, mã mời 6 số unique, config Pomodoro đầy đủ (work/break/longBreak/cycles), media URL hiện tại, sức chứa.
- `StudyRoomMember`: membership + role + thời gian tập trung tích luỹ. Một user một bản ghi mỗi phòng.
- Convention: role/status dùng `Int` (khớp `ExamSession.status Int`), field camelCase, index cho các query thường dùng.

## Implementation Steps

1. Thêm vào `examio-be/libs/database/src/schema.prisma`:

```prisma
model StudyRoom {
    id                    String            @id @default(cuid())
    name                  String
    description           String?
    hostId                String
    inviteCode            String            @unique // 6-digit
    workMinutes           Int               @default(30)
    breakMinutes          Int               @default(5)
    longBreakMinutes      Int               @default(15)
    cyclesBeforeLongBreak Int               @default(4)
    currentMediaUrl       String?           // YouTube URL đang phát (nhạc hoặc video)
    isActive              Boolean           @default(true) // host đóng/mở phòng
    maxParticipants       Int               @default(20)
    createdAt             DateTime          @default(now())
    updatedAt             DateTime          @updatedAt
    host                  User              @relation("HostedStudyRooms", fields: [hostId], references: [id], onDelete: Cascade)
    members               StudyRoomMember[]

    @@index([hostId])
    @@index([inviteCode])
}

model StudyRoomMember {
    id                String    @id @default(cuid())
    studyRoomId       String
    userId            String
    role              Int       @default(0) // 0 MEMBER, 1 COHOST, 2 HOST
    totalFocusSeconds Int       @default(0)
    joinedAt          DateTime  @default(now())
    lastSeenAt        DateTime  @default(now())
    studyRoom         StudyRoom @relation(fields: [studyRoomId], references: [id], onDelete: Cascade)
    user              User      @relation(fields: [userId], references: [id], onDelete: Cascade)

    @@unique([studyRoomId, userId])
    @@index([userId])
}
```

2. Thêm back-relations vào `model User`: `hostedStudyRooms StudyRoom[] @relation("HostedStudyRooms")` và `studyRoomMemberships StudyRoomMember[]`.
3. `cd examio-be && yarn prisma:merge && yarn prisma:generate && yarn prisma:migrate` (tên migration: `add_study_room`).
4. `yarn build` xác nhận không lỗi type.

## Todo

- [ ] StudyRoom + StudyRoomMember trong schema.prisma
- [ ] Back-relations trên User
- [ ] Merge + generate + migrate
- [ ] Build xanh

## Success Criteria

- Migration apply sạch; Prisma client sinh type `StudyRoom`/`StudyRoomMember`; `yarn build` pass.

## Risk

- Schema dùng chung nhiều service → chỉ THÊM model, không sửa model cũ; rủi ro thấp.
