---
name: clarifications-landing-i18n
description: Localization decisions for landing and auth pages i18n implementation
metadata:
  type: reference
---

## Session 2026-06-01

- Q: PricingBand: Giữ pricing tier text tĩnh trong locale files hay đổi sang API? → A: **Đổi sang API locale-aware** — Backend thêm locale-aware fields, frontend fetch theo ngôn ngữ hiện tại
- Q: Legal page content: Giữ trong locale files hay tách ra CMS? → A: **Tách ra CMS sau** — Legal/About content từ API, có thể thêm locale param
- Q: Locale storage key: Reuse `examio.locale` hay tách riêng cho i18next? → A: **Tách riêng hoàn toàn** — i18next dùng key riêng, giữ `examio.locale` như legacy
