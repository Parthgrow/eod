# Database schema

All data lives in **Vercel KV** (Redis). This file is the source of truth for
every key we store — **keep it updated whenever the schema changes.** The key
builders themselves live in `lib/kv-keys.ts`.

> **Sessions are not in KV.** A signed JWT (`eod_session`, an httpOnly cookie)
> carries `{ userId, email, orgId }`. See `lib/session.ts`.

_Last updated: 2026-09-19_

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
| `org:{orgId}:board:{boardId}:ticket:{id}` | json | `{ id, boardId, title, description?, status, createdAt, updatedAt, createdBy, assigneeId?, projectId?, …board fields }` | A single ticket |
| `org:{orgId}:board:{boardId}:seq` | string (int) | last issued number | Counter behind the human ticket id (`SUP-42`) |
| `org:{orgId}:board:{boardId}:ticket_meta` | hash | `{id}:n` number, `{id}:m` message count, `{id}:p` payload count | Per-ticket number + counters, kept out of the ticket JSON |
| `org:{orgId}:board:{boardId}:ticket_numbers` | hash | `number → ticketId` | Look a ticket up by its number |
| `org:{orgId}:board:{boardId}:ticket:{id}:messages` | hash | `messageId → { id, ticketId, kind: "request"\|"response", body, authorId, authorEmail, createdAt, editedAt? }` | The ticket's conversation (sorted by `createdAt` in the app) |
| `org:{orgId}:board:{boardId}:ticket:{id}:payloads` | hash | `payloadId → { id, ticketId, request: { body, method?, url? }, response: { body, status? }, createdBy, createdAt, updatedAt? }` | API request/response pairs (sorted by `createdAt` in the app) |

**Ticket number (`SUP-42`).** Each board has a `prefix` in `lib/boards.ts`
(`API`, `SUP`, `GEN`). A ticket's number is assigned on create, and lazily the
first time an older ticket is listed (oldest first) — only `ticket_meta` /
`ticket_numbers` are written, never the ticket JSON. The first writer of
`{id}:n` wins (`HSETNX`), so concurrent loads can't double-number a ticket;
a lost race just leaves a gap in the sequence.

**Conversation and payloads** are per-board features (`features` in
`lib/boards.ts`; Support has both, API integrations has payloads only) shown in
the ticket side panel. They are hashes keyed by item id so one item can be
edited or deleted atomically. Limits: 200 messages / 50 payloads per ticket,
100KB per payload body. Messages are author-only edit/delete; payloads can be
edited by any org member. Deleting a ticket deletes its messages, payloads,
number and counters.

Fields on a ticket:
- **`title`** — required, editable.
- **`description`** — universal, optional freeform text; absent when blank (an
  empty edit removes the key rather than storing `""`).
- **`createdBy`** — userId who created it (set from session; **not** shown in the UI).
- **`priority`** — universal, optional; one of `p1`, `p2`, `p3`. Editable inline
  on the card; an empty value removes the key. (Was previously a support-board
  field with `low`/`medium`/`high` — see the migration note below.)
- **`assigneeId`** — universal, optional; references an org member (shown on the card as the part before `@`).
- **`projectId`** — general board only; references a project (see Projects below).
- Board-specific fields (e.g. `provider`) — optional typed columns; each board's def declares which it uses.

> **Legacy priority values.** Support tickets created before priority became
> universal hold `low` / `medium` / `high`. They still display and still filter;
> the card editor keeps the old value selectable so an unrelated edit can't
> silently drop it. Nothing migrates them automatically — map them to
> `high→p1`, `medium→p2`, `low→p3` if you want them normalised.

`status` is one of the board's column ids. (`boardId` is the internal id, e.g.
`integrations`, whose URL slug is `api`.)

## Projects

Normalized entities that tickets reference by id (the general board's `projectId`).
Created inline from the ticket form or on the `/projects` page; names are unique
per org (case-insensitive).

| Key | Type | Value | Purpose |
|-----|------|-------|---------|
| `org:{orgId}:projects` | set | `projectId…` | Index of the org's projects |
| `org:{orgId}:project:{id}` | json | `{ id, orgId, name, createdAt, createdBy }` | A project |

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
   ├─ projects ─────< Project        org:{orgId}:project:{id}   (ticket.projectId →)
   └─ eod_index ────< EOD Entry      eod:user:{userId}:entry:{date}
                                     (authored per-user, indexed at the org)
```
