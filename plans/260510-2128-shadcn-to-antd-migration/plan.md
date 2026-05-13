---
name: shadcn-to-antd-migration
status: completed
created: 2026-05-10
blockedBy: []
blocks: []
---

# Refactor toàn bộ FE từ shadcn/Radix sang Ant Design

## Mục tiêu

Thay toàn bộ usage của `src/components/ui/*` kiểu shadcn/Radix bằng Ant Design, cài dependency mới, giữ business logic/API/store hiện có, sau cùng xóa dependency và component shadcn không còn dùng.

## Scope hiện tại

- `src/components/ui`: 39 file component/helper UI.
- `@/components/ui/*`: 168 file đang import.
- shadcn/Radix references: khoảng 514 references.
- Component dùng nhiều nhất: `button` 87, `card` 75, `toast` 34, `badge` 34, `input` 31, `label` 27, `dialog` 25.
- Dependencies cần loại bỏ sau migration: `@radix-ui/*`, `class-variance-authority`, `vaul` nếu không còn dùng bởi feature khác.

## Nguyên tắc migration

1. Không rewrite business logic.
2. Không đổi API contract/store shape.
3. Dùng AntD component thật, không mock/shim dài hạn.
4. Chỉ giữ Tailwind cho layout/page spacing nếu cần; UI primitive dùng AntD.
5. Migrate theo nhóm import, mỗi phase phải build được.
6. Chỉ xóa shadcn/Radix khi grep không còn usage.

## Phases

| Phase | File | Status | Mục tiêu |
|---|---|---|---|
| 01 | [phase-01-dependency-and-theme-foundation.md](phase-01-dependency-and-theme-foundation.md) | completed | Cài AntD, theme provider, token mapping |
| 02 | [phase-02-form-and-basic-primitives.md](phase-02-form-and-basic-primitives.md) | completed | Button/Input/Form primitives |
| 03 | [phase-03-overlay-navigation-feedback.md](phase-03-overlay-navigation-feedback.md) | completed | Modal/Drawer/Dropdown/Tabs/Toast |
| 04 | [phase-04-data-display-and-page-migration.md](phase-04-data-display-and-page-migration.md) | completed | Card/Table/Badge/Avatar/Skeleton/pages |
| 05 | [phase-05-remove-shadcn-radix-dependencies.md](phase-05-remove-shadcn-radix-dependencies.md) | completed | Xóa component/dependency shadcn/Radix |
| 06 | [phase-06-validation-and-regression.md](phase-06-validation-and-regression.md) | completed | Build/lint/manual regression |

## Validation bắt buộc

- `yarn build` pass sau từng phase.
- `yarn lint` không có error mới.
- `grep -R "@/components/ui/" src` về 0 trước khi xóa `src/components/ui`.
- `grep -R "@radix-ui" src package.json` về 0 trước khi remove Radix deps.
- Kiểm tra thủ công các flow: auth, dashboard, AI chat, exam/session, flashcard, subscription/payment, materials.

## Cook command

```bash
/cook /Users/tgiap.dev/devs/kma-edu/plans/260510-2128-shadcn-to-antd-migration/plan.md
```
