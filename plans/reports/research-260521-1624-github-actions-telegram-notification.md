# Study Report: GitHub Actions Telegram Notification

**Date:** 2026-05-21

## Summary

Có thể dễ dàng gửi thông báo Telegram mỗi khi GitHub Actions build thành công hoặc thất bại bằng action `appleboy/telegram-action`. Chỉ cần tạo Telegram Bot, lấy chat ID, thêm secrets vào repo và thêm step notify vào workflow.

## Giải pháp đề xuất

### Bước 1: Tạo Telegram Bot

1. Mở Telegram, tìm `@BotFather`
2. Gửi `/newbot`, đặt tên bot (ví dụ: `Examio CI Bot`)
3. Nhận **Bot Token** (dạng `123456:ABC-DEF...`)
4. Gửi tin nhắn bất kỳ cho bot (hoặc thêm bot vào group)
5. Gọi API lấy chat ID:
   ```bash
   curl https://api.telegram.org/bot<TOKEN>/getUpdates
   ```
6. Tìm `"chat":{"id": 123456789}` trong response — đó là **Chat ID**

### Bước 2: Thêm Secrets vào GitHub Repo

Vào **Settings → Secrets and variables → Actions**, thêm:
- `TELEGRAM_TOKEN` — Bot token từ BotFather
- `TELEGRAM_TO` — Chat ID (cá nhân hoặc group)

### Bước 3: Thêm notification step vào workflow

Thêm step sau vào cuối job `deploy` trong `.github/workflows/deploy.yml`:

```yaml
      - name: Notify Telegram (Success)
        if: success()
        uses: appleboy/telegram-action@master
        with:
          to: ${{ secrets.TELEGRAM_TO }}
          token: ${{ secrets.TELEGRAM_TOKEN }}
          format: markdown
          message: |
            ✅ *Deploy thành công*
            
            📦 Repo: `${{ github.repository }}`
            🌿 Branch: `${{ github.ref_name }}`
            👤 By: ${{ github.actor }}
            🔗 [Xem commit](https://github.com/${{ github.repository }}/commit/${{ github.sha }})

      - name: Notify Telegram (Failure)
        if: failure()
        uses: appleboy/telegram-action@master
        with:
          to: ${{ secrets.TELEGRAM_TO }}
          token: ${{ secrets.TELEGRAM_TOKEN }}
          format: markdown
          message: |
            ❌ *Deploy thất bại*
            
            📦 Repo: `${{ github.repository }}`
            🌿 Branch: `${{ github.ref_name }}`
            👤 By: ${{ github.actor }}
            🔗 [Xem logs](https://github.com/${{ github.repository }}/actions/runs/${{ github.run_id }})
```

### Workflow hoàn chỉnh (phần thay đổi)

Trong file `deploy.yml` hiện tại, thêm 2 step trên vào cuối job `deploy`, sau step "Deploy to VPS".

## Lưu ý

| Vấn đề | Giải pháp |
|--------|-----------|
| "Chat not found" error | Phải gửi tin nhắn cho bot trước, rồi mới gọi `getUpdates` |
| Notify group | Thêm bot vào group, dùng group chat ID (số âm, ví dụ `-100123456`) |
| Forum/topic | Thêm `message_thread_id` nếu group dùng topics |
| Silent notify | Thêm `disable_notification: true` |
| Markdown escape | Ký tự đặc biệt (`_`, `*`, `` ` ``) cần escape trong MarkdownV2 |

## Action khác (alternatives)

| Action | Ưu điểm |
|--------|---------|
| `appleboy/telegram-action` | Phổ biến nhất, nhiều tính năng (photo, document, location) |
| `cbrgm/telegram-github-action` | Lightweight hơn |
| Curl trực tiếp | Không phụ thuộc action bên thứ 3 |

### Curl trực tiếp (không dùng action)

```yaml
      - name: Notify Telegram
        if: always()
        run: |
          STATUS="${{ job.status }}"
          if [ "$STATUS" = "success" ]; then
            EMOJI="✅"
          else
            EMOJI="❌"
          fi
          curl -s -X POST "https://api.telegram.org/bot${{ secrets.TELEGRAM_TOKEN }}/sendMessage" \
            -d chat_id="${{ secrets.TELEGRAM_TO }}" \
            -d parse_mode="Markdown" \
            -d text="${EMOJI} *Deploy ${STATUS}*%0A📦 \`${{ github.repository }}\`%0A🌿 \`${{ github.ref_name }}\`%0A👤 ${{ github.actor }}"
```

## Sources

- [appleboy/telegram-action](https://github.com/appleboy/telegram-action) — GitHub Action chính
- [Telegram Bot API - sendMessage](https://core.telegram.org/bots/api#sendmessage)
- [GitHub Actions context variables](https://docs.github.com/en/actions/learn-github-actions/contexts)
