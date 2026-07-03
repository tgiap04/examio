# Business Context — F014_AdminDashboard

## Why It Matters

Running a platform with paying users, AI-generated content, and exam integrity requirements means someone needs visibility and control: who's using the platform, whether payments are behaving correctly, and whether anything is going wrong right now. Without an admin dashboard, every one of these questions would require a direct database query or a developer's time. The dashboard turns operational tasks — refunding a customer, banning an abusive account, checking today's signups — into a few clicks, with every action automatically logged for accountability.

## Who Uses It

- **Admin / Operator** — the only role with access. Uses the dashboard daily to monitor platform health, respond to user issues, and handle finance operations like refunds.

## What They Do

1. An admin opens the dashboard and sees an overview: today's signups, active users, revenue, and other key numbers at a glance.
2. They can dig into detailed time-series charts for signups, traffic, and revenue over a chosen date range.
3. When a user reports an issue or needs moderation, the admin searches the user list, views their detail, and can ban, unban, or grant/revoke admin access as needed.
4. When a payment needs correcting, the admin processes a refund, adjusts a user's credit balance, or changes their subscription tier — all logged automatically.
5. If something seems wrong with the platform, the admin opens the live log viewer to watch server activity in real time, filtered by service and severity.
6. To answer "who did what and when," the admin queries the audit log, which records every admin action with full detail.

## Unresolved Questions

- Should any admin action ever require a second admin's approval (four-eyes principle) given the financial impact of refunds/credit adjustments?
- Is there a plan to expose any of these capabilities to a more limited "support" role short of full admin?
