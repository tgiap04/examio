# Phase 01 — Dependency and Theme Foundation

## Overview

Priority: Critical  
Status: completed

Cài Ant Design và thiết lập nền theme/provider để các phase sau migrate component mà không làm lệch brand màu hiện tại.

## Context Links

- `package.json`
- `src/provider/AppProviders.tsx`
- `src/main.tsx`
- `src/index.css` hoặc global CSS hiện có
- `tailwind.config.ts`
- `components.json`

## Requirements

- Thêm `antd` vào dependencies.
- Import CSS reset/style của AntD đúng entrypoint.
- Bọc app bằng `ConfigProvider`.
- Map token AntD theo màu hệ thống hiện tại thay vì đổi brand.
- Không remove shadcn/Radix ở phase này.

## Implementation Steps

1. Chạy `yarn add antd` trong `examio-fe`.
2. Tạo hoặc cập nhật provider hiện có để thêm `ConfigProvider`.
3. Thiết lập token tối thiểu:
   - `colorPrimary`: màu primary hiện tại của hệ thống.
   - `borderRadius`: match radius đang dùng.
   - font family giữ nguyên global font hiện tại.
4. Import style AntD ở entrypoint nếu cần.
5. Kiểm tra CSS conflict với Tailwind/base CSS.
6. Chạy build/lint.

## Success Criteria

- App build được sau khi thêm AntD.
- Không đổi UI lớn ở phase này.
- AntD component demo nhỏ có thể render nếu cần test nội bộ rồi bỏ.

## Risks

- AntD CSS reset ảnh hưởng layout cũ.
- Token màu lệch brand nếu lấy màu hard-code sai.

## Todo

- [ ] Install `antd`
- [ ] Add `ConfigProvider`
- [ ] Map theme tokens
- [ ] Validate build/lint
