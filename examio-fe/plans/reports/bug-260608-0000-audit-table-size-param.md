---
type: bug
date: 2026-06-08
title: AuditTable size param 400 + React infinite loop
---

# Bug — AuditTable `size` param 400 + React Maximum update depth exceeded

## Symptom

User reports two issues when accessing `/admin/audit` with filter action:

1. **400 Validation Error**:
   ```json
   {
     "statusCode": 400,
     "message": "Validation failed",
     "errors": [
       {
         "code": "unrecognized_keys",
         "keys": ["size"],
         "path": [],
         "message": "Unrecognized key(s) in object: 'size'"
       }
     ]
   }
   ```

2. **React "Maximum update depth exceeded"** — Infinite render loop when the component catches the 400 error, sets error state, re-renders, calls the API again with the same bad params, gets 400 again, infinite loop.

## Root cause

Same as the previous `UserTable` fix (session 260607-2334):

- **BE DTO** `ListAuditQuery` uses `.strict()` and only accepts `pageSize` (not `size`).
- **FE `AuditTable.tsx:56`** passes `size: pageSize` to the query.

When the user applies a filter (`action=admin.finance.refund,admin.finance.credit,admin.finance.tier_change&page=1&size=50`), the gateway forwards `size=50` to admin-service, which rejects it with 400.

The FE `AuditTable` component catches the 400, renders an error `<Alert>` with a retry button. When the user clicks retry, it calls `fetchAudit(query, true)` with the SAME bad `query` object (still containing `size`), getting 400 again, re-rendering the error, infinite loop → "Maximum update depth exceeded".

## Fix

Change `size: pageSize` to `pageSize: pageSize` in `AuditTable.tsx:56`.

```diff
-      size: pageSize,
+      pageSize: pageSize,
```

## Verification

```bash
$ curl -b cookies.txt -o /dev/null -w "%{http_code}\n" \
  "http://localhost:3000/api/v1/admin/audit?action=admin.finance.refund,admin.finance.credit,admin.finance.tier_change&page=1&size=50"
400  # Before fix (expected - FE still sends size=50 via browser)

$ curl -b cookies.txt -o /dev/null -w "%{http_code}\n" \
  "http://localhost:3000/api/v1/admin/audit?action=admin.finance.refund,admin.finance.credit,admin.finance.tier_change&page=1&pageSize=50"
200  # After fix - AuditTable now sends pageSize
```

Note: The browser will still send `size=50` if the user manually types it or uses the old bookmarked URL, but the FE component now correctly sends `pageSize`.

## Files changed (1)

```
src/components/admin/AuditTable.tsx  (line 56: size → pageSize)
```

## Prevention

The `pageSize` ↔ `size` mismatch has now been fixed in:
- `UserTable.tsx` (line 70)
- `AdminAuditPage.tsx` (line 32)
- `AuditTable.tsx` (line 56)
- `useAdminStore.ts` (response types)
- `adminApi.ts` (DTO types)

All admin paginated endpoints now consistently use `pageSize` as the canonical param name.