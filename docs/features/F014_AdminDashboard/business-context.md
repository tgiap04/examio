# Business Context — F014_AdminDashboard

## Why It Matters

Running a platform with AI-generated content, and exam integrity requirements means someone needs visibility and control: who's using the platform, and whether anything is going wrong right now. Without an admin dashboard, every one of these questions would require a direct database query or a developer's time. The dashboard turns operational tasks — banning an abusive account, checking today's signups — into a few clicks, with every action automatically logged for accountability.

## Who Uses It

- **Admin / Operator** — the only role with access. Uses the dashboard daily to monitor platform health, and respond to user issues.

## What They Do

1. An admin opens the dashboard and sees an overview: today's signups, active users, and other key numbers at a glance.
2. They can dig into detailed time-series charts for signups and traffic over a chosen date range.
3. When a user reports an issue or needs moderation, the admin searches the user list, views their detail, and can ban or unban them; on the role management screen they assign Student / Teacher and grant or revoke System admin, and read the role change history.
4. If something seems wrong with the platform, the admin opens the live log viewer to watch server activity in real time, filtered by service and severity.
5. To answer "who did what and when," the admin queries the audit log, which records every admin action with full detail.

## Unresolved Questions

- Should any admin action ever require a second admin's approval (four-eyes principle) given the impact of role changes and bans?
- Is there a plan to expose any of these capabilities to a more limited "support" role short of full admin?
