# Phase 01 — BadgePill shared component

## Goal
Replace every antd `<Tag color="geekblue|green|red|blue|volcano|purple|orange|cyan|default">` in the admin with a token-driven `<BadgePill>`.

## Files
- **Create** `examio-fe/src/components/admin/BadgePill.tsx`

## Spec
```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export type BadgeVariant = "positive" | "negative" | "neutral";

const variantClasses: Record<BadgeVariant, string> = {
  positive: "bg-coral/10 text-coral",
  negative: "bg-error/10 text-error",
  neutral: "bg-surface-card text-ink/70",
};

interface BadgePillProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

export function BadgePill({
  variant = "neutral",
  children,
  className,
}: BadgePillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-pill px-2.5 py-0.5 text-xs font-medium",
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
```

## Variant mapping (per audit)

| Source | Condition | Variant |
|---|---|---|
| UserTable.isAdmin | true | positive |
| UserTable.isVerified | true | positive |
| UserTable.isBanned | true | negative |
| UserDetailDrawer.isAdmin | true | positive |
| UserDetailDrawer.isVerified | true | positive |
| UserDetailDrawer.isBanned | true | negative |
| UserDetailDrawer.subscription.isActive | true | positive |
| AuditTable: `admin.finance.refund` | — | negative |
| AuditTable: `admin.finance.credit` | — | positive |
| AuditTable: `admin.finance.tier_change` | — | neutral |
| AuditTable: `admin.user.ban` | — | negative |
| AuditTable: `admin.user.unban` | — | positive |
| AuditTable: `admin.user.grant` | — | positive |
| AuditTable: `admin.user.revoke` | — | neutral |
| AuditTable: `admin.user.update` | — | neutral |
| AuditTable: other | — | neutral |
| LogStreamPanel: status.idle | — | neutral |
| LogStreamPanel: status.open | — | positive |
| LogStreamPanel: status.connecting | — | positive |
| LogStreamPanel: status.reconnecting | — | positive |
| LogStreamPanel: status.error | — | negative |
| LogStreamPanel: status.closed | — | negative |

## Success
- File created at `examio-fe/src/components/admin/BadgePill.tsx`.
- `yarn tsc --noEmit` passes.
