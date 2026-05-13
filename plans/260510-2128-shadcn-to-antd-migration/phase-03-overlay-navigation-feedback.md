# Phase 03 — Overlay, Navigation, and Feedback

## Overview

Priority: Critical  
Status: completed

Migrate các component tương tác phức tạp: Dialog, AlertDialog, Drawer/Sheet, Dropdown, Select, Tabs, Tooltip, Toast.

## Context Links

- `src/components/ui/dialog.tsx`
- `src/components/ui/alert-dialog.tsx`
- `src/components/ui/drawer.tsx`
- `src/components/ui/sheet.tsx`
- `src/components/ui/dropdown-menu.tsx`
- `src/components/ui/select.tsx`
- `src/components/ui/tabs.tsx`
- `src/components/ui/tooltip.tsx`
- `src/components/ui/toast.tsx`
- `src/components/atoms/ProfileDropdown.tsx`
- `src/components/organisms/k/SideBar.tsx`
- `src/components/molecules/PricingTable.tsx`

## Requirements

- Replace dialogs with AntD `Modal`.
- Replace destructive confirmations with AntD `Modal.confirm` or controlled `Modal`.
- Replace Drawer/Sheet with AntD `Drawer`.
- Replace dropdown menu with AntD `Dropdown` + `MenuProps`.
- Replace select with AntD `Select`.
- Replace tabs with AntD `Tabs`.
- Replace tooltip with AntD `Tooltip`.
- Replace custom toast implementation with AntD `message`/`notification` wrapper.

## Implementation Steps

1. Create/update a small app-level notification helper if current code calls `toast.success/error` in many places.
2. Migrate `toast` call sites to either:
   - direct `message.success/error`, or
   - a compatibility helper outside `src/components/ui` during transition.
3. Migrate navigation dropdown/profile dropdown.
4. Migrate modal/confirm flows with destructive actions.
5. Migrate selects/tabs/drawers.
6. Check keyboard and focus behavior manually.

## Mapping Notes

- `AlertDialog` → `Modal` with explicit `open`, `onCancel`, `footer`.
- `DropdownMenu` → `Dropdown menu={{ items, onClick }}`.
- `Select value/onValueChange` → `Select value/onChange`.
- `Tabs value/onValueChange` → `Tabs activeKey/onChange`.
- `toast.success(msg)` → `message.success(msg)` or notification helper.

## Success Criteria

- No runtime issue like `React.Children.only` from Radix remains.
- Destructive dialogs still require confirmation.
- Toast/error messages wrap or display fully.
- Build/lint pass.

## Risks

- Modal focus/portal behavior differs.
- Select option shape changes may break existing data mapping.
- Toast API migration touches many files; do it in batches.

## Todo

- [ ] Toast/message strategy
- [ ] Dropdown/profile/sidebar
- [ ] Modal/AlertDialog flows
- [ ] Select/Tabs/Drawer/Tooltip
- [ ] Build/lint
