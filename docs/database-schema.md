# Database schema

All data lives in **Vercel KV** (Redis). This file is the source of truth for
every key we store — **keep it updated whenever the schema changes.** The key
builders themselves live in `lib/kv-keys.ts`.

> **Sessions are not in KV.** A signed JWT (`eod_session`, an httpOnly cookie)
> carries `{ userId, email, orgId }`. See `lib/session.ts`.

_Last updated: 2026-07-29_

## Conventions

- `{userId}` — a UUID.
- `{orgId}` — an email **domain** for a team (`finaxle.com`), or `personal:{userId}` for public-domain / solo users.
- `{date}` — `YYYY-MM-DD` (UTC calendar day).
- **Types:** `string`, `hash`, `set`, `zset` (sorted set), `json` (a JSON blob stored via `kv.set`).

---

## Users & accounts

| Key | Type | Value | Purpose |
|-----|------|-------|---------|
| `eod:user:by-email:{email}` | string | `userId` | Look up a user id by email (login) |
| `eod:user:{userId}` | hash | `{ id, email, orgId, createdAt }` | The user record; `orgId` = their active workspace |
| `eod:account:{providerId}:{userId}` | hash | `{ passwordHash }` | Auth credentials per provider (`credentials` today) |

## Organizations & membership

An organization is a workspace. `orgId` is the email **domain** for a company,
or `personal:{userId}` for public-domain / solo users.

| Key | Type | Value | Purpose |
|-----|------|-------|---------|
| `org:{orgId}` | hash | `{ id, kind, domain, name, createdAt, createdBy }` | The workspace; `kind` = `team` \| `personal` |
| `org:{orgId}:members` | set | `userId…` | Index: org → its users |
| `org:{orgId}:member:{userId}` | hash | `{ userId, orgId, role, joinedAt }` | Membership "row"; `role` = `member` |
| `eod:user:{userId}:orgs` | set | `orgId…` | Index: user → their orgs (many-to-many seam) |

## Boards & tickets

Boards are **defined in code** (`lib/boards.ts`), not stored in KV — a fixed
catalog (`api`, `support`, `general`), each with its own columns and fields. A
**ticket** is the atomic card; it lives on one board, scoped to the org.

| Key | Type | Value | Purpose |
|-----|------|-------|---------|
| `org:{orgId}:board:{boardId}:tickets` | set | `ticketId…` | Index of a board's tickets |
| `org:{orgId}:board:{boardId}:ticket:{id}` | json | `{ id, boardId, title, status, createdAt, updatedAt, …board fields }` | A single ticket |

Board-specific fields (e.g. `provider`, `priority`) are optional typed columns on
the ticket; each board's def declares which it uses. `status` is one of the
board's column ids. (`boardId` is the internal id, e.g. `integrations`, whose URL
slug is `api`.)

## End-of-day (EOD) entries

Entries are authored per-user per-day, and surfaced org-wide.

| Key | Type | Value | Purpose |
|-----|------|-------|---------|
| `eod:user:{userId}:entry:{date}` | json | `{ userId, authorEmail, orgId, date, content, createdAt, updatedAt }` | One person's EOD for one day |
| `eod:user:{userId}:entry_dates` | zset | member `date`, score `YYYYMMDD` | Index of a user's own entries |
| `org:{orgId}:eod_index` | zset | member `{date}#{userId}`, score `YYYYMMDD` | The org-wide feed (all members) |

---

## Relationships

```
Organization  ─ org:{orgId}
   ├─ members ──────< User           eod:user:{userId}   (.orgId → org)
   ├─ boards ───────< Ticket         org:{orgId}:board:{boardId}:ticket:{id}
   └─ eod_index ────< EOD Entry      eod:user:{userId}:entry:{date}
                                     (authored per-user, indexed at the org)
```
