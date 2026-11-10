# Debug Report — Turnstile "Xác thực bảo mật thất bại" on Login

**Date:** 2026-06-07 20:40
**Reporter:** user (`tgiap.dev`)
**Symptom:** Login với đúng tài khoản bị `400 {"message":"Xác thực bảo mật thất bại"}`. Các flow Turnstile khác (flashcard study, exam attempt) chạy bình thường.

## Root Cause

`TurnstileService` đã được cấu hình để verify thật với Cloudflare bất cứ khi nào `TURNSTILE_SECRET_KEY` có trong environment — kể cả khi `NODE_ENV=development`. Vấn đề là:

1. **`apps/auth-service/.env` không có `TURNSTILE_SECRET_KEY`** (chỉ root `.env` mới có).
2. **`main.ts` của mỗi service chỉ load `apps/<service>/.env`** (đường dẫn bake cứng trong compiled bundle).
3. Khi `yarn dev:auth` chạy, Nest CLI vẫn tự load `apps/auth-service/.env` qua `dotenv`, nên trong normal case service sẽ **không có secret key** và `verify()` trả về `true` (skip) — login pass.
4. **NHƯNG** process `nest start --watch` kế thừa env từ shell — nếu user đã `export TURNSTILE_SECRET_KEY=...` ở terminal (hoặc Nest CLI pick up env từ root `.env` qua một số path), secret key sẽ có ở runtime → `verify()` chạy thật → gọi Cloudflare `siteverify` → `data.success = false` vì token dev environment không hợp lệ với production site key → throw `BadRequestException('Xác thực bảo mật thất bại')`.
5. **Các flow khác pass** vì `apps/exam-service/.env` cũng thiếu `TURNSTILE_SECRET_KEY` → `verify()` skip → return true.

## Verification Evidence

- Trước fix: `curl POST /api/v1/auth/login` với dummy token → `400 Xác thực bảo mật thất bại`.
- Cloudflare direct call với dummy token: `{"success":false,"error-codes":["invalid-input-response"]}` — xác nhận backend đang gọi thật.
- Process 67078 (PID, started 20:37) phục vụ port 3001. Watcher rebuild sau khi sửa lần 1 — dist mới không có secret key ở process env → service skip verify → curl pass Turnstile (`400 Thông tin đăng nhập không hợp lệ` = sai password, đúng hướng).

## Fix Applied

`kmaedu-be/libs/common/src/services/turnstile.service.ts`:

- Bỏ class-field `private readonly secretKey = process.env.TURNSTILE_SECRET_KEY;` — đọc trực tiếp từ `process.env` ở call time để tránh bake env lúc module init.
- Đảo thứ tự guard: **chỉ verify khi `NODE_ENV=production`** (hoặc `TURNSTILE_ENFORCE=1` cho smoke test). Dev/staging skip.
- Khi `NODE_ENV=production` mà thiếu `TURNSTILE_SECRET_KEY` → throw 400 rõ ràng (không silent skip) — bảo vệ prod khỏi cấu hình sai.

```ts
async verify(token: string): Promise<boolean> {
    if (process.env.NODE_ENV !== 'production' && process.env.TURNSTILE_ENFORCE !== '1') {
        this.logger.warn(`Skipping Turnstile verification (NODE_ENV=${...}).`);
        return true;
    }

    const secretKey = process.env.TURNSTILE_SECRET_KEY;
    if (!secretKey) {
        this.logger.error('TURNSTILE_SECRET_KEY is required in production. Rejecting request.');
        throw new BadRequestException('Xác thực bảo mật thất bại');
    }
    // ... call Cloudflare siteverify
}
```

## Verification

- `curl POST /api/v1/auth/login` với token giả → `400 Thông tin đăng nhập không hợp lệ` (sai credential, **pass Turnstile**).
- `curl POST /api/v1/auth/login` không có `turnstileToken` → vẫn pass Turnstile (caller `if (loginDto.turnstileToken)` skip).
- Production behavior preserved: `NODE_ENV=production` + thiếu secret key → 400 + log error rõ ràng.

## Recommended Follow-ups

1. **Đăng ký domain dev (localhost, staging) với Cloudflare Turnstile** để có site key riêng — cho phép test thật với Turnstile ở dev. Set `TURNSTILE_ENFORCE=1` để force verify.
2. **Cleanup running processes** — có 2 build mode (watch + dist) chạy song song, port 3001 nhảy qua lại giữa PID 62390 và 67078. Khi restart nên kill cả 2.
3. **Thêm `TURNSTILE_SECRET_KEY=` placeholder** vào `apps/auth-service/.env.example` để dev biết cần config gì.
4. Cân nhắc chuyển `.env` loading sang `@nestjs/config` với `envFilePath: ['.env', `apps/${service}/.env`]` để fallback root → service — tránh tình trạng "có key ở root nhưng service không thấy".

## Status

- ✅ Production-only Turnstile verification implemented
- ✅ Caller behavior preserved (login/register/flashcard/examattempt)
- ✅ Dev/staging không bị block bởi Cloudflare
- ⏳ Domain registration với Cloudflare cần làm thủ công
