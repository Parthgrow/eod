This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## MCP server (connect Claude)

The app ships an [MCP](https://modelcontextprotocol.io) server so Claude (Claude Code, claude.ai, and the desktop and mobile apps) can read and change your workspace's data with tools:

`whoami`, `get_stats`, `list_boards`, `list_tickets`, `get_ticket`, `create_ticket`, `update_ticket`, `delete_ticket`, `add_ticket_message`, `add_ticket_payload`, `list_projects`, `create_project`, `list_members`, `get_eod`, `list_eod_entries`, `save_eod`.

The tools live in `lib/mcp/tools.ts` and go through the same stores as the web routes, so the same validation and rules apply (for example, past EOD days are write-once). Everything is scoped to the token owner's workspace; the workspace is read from the user record, never from tool input.

### Remote server (Claude Code)

1. Sign in, click **Connect Claude** (`/settings`) and generate a token. It is shown once.
2. Run the command shown on that page:

```bash
claude mcp add --transport http eod https://<your-host>/api/mcp --header "Authorization: Bearer <token>"
```

`POST /api/mcp` is a stateless Streamable HTTP endpoint (JSON responses, no sessions). `GET` and `DELETE` return 405.

### claude.ai, desktop and mobile apps

In Claude, open **Settings → Connectors → Add custom connector**, paste the URL from `/settings` and leave authentication empty:

```
https://<your-host>/api/mcp/<token>
```

Connectors added on claude.ai are also available in the desktop and mobile apps.

### Local server (stdio)

`.mcp.json` registers a local stdio server for Claude Code in this repo. It talks to KV directly, as the user in `EOD_USER_ID` (shown on `/settings`). Put these in `.env`:

```
KV_REST_API_URL=...
KV_REST_API_TOKEN=...
EOD_USER_ID=<your user id>
```

It runs `npx tsx --conditions=react-server --env-file=.env scripts/mcp-server.ts`. The `react-server` condition turns the `server-only` imports in `lib/` into no-ops outside Next.

### Security

- A token acts as you. Only its SHA-256 is stored in KV; the raw value is shown once. Each user can have up to 10 tokens.
- The `/api/mcp/<token>` URL **is the credential**. Treat it like a password, and don't paste it anywhere shared.
- Revoke a token on `/settings` and it stops working on both endpoints immediately.
- The local stdio server uses your KV credentials and can act as any user id you give it. Only run it on your own machine.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
