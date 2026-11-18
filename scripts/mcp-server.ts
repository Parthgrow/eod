// Local MCP server over stdio, for Claude Code / Claude Desktop on your machine.
//
//   npx tsx --conditions=react-server --env-file=.env scripts/mcp-server.ts
//
// Needs KV_REST_API_URL, KV_REST_API_TOKEN and EOD_USER_ID (shown on /settings).
// `--conditions=react-server` turns the `server-only` imports in lib/ into no-ops.
// stdout is the MCP channel, so everything else is logged to stderr.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MCP_INSTRUCTIONS, MCP_SERVER_INFO, registerTools } from "@/lib/mcp/tools";
import { getUserContext } from "@/lib/org-store";

function die(message: string): never {
  console.error(`[eod-mcp] ${message}`);
  process.exit(1);
}

// tsx runs this file as CommonJS, where top-level await isn't allowed.
async function main() {
  const missing = ["KV_REST_API_URL", "KV_REST_API_TOKEN", "EOD_USER_ID"].filter((k) => !process.env[k]);
  if (missing.length) {
    die(`Missing env: ${missing.join(", ")}. Put them in .env (EOD_USER_ID is shown on the app's /settings page).`);
  }

  const userId = process.env.EOD_USER_ID!.trim();
  const me = await getUserContext(userId).catch((err) => die(`Could not reach KV: ${err?.message ?? err}`));
  if (!me) die(`No user with id ${userId} (or it has no workspace yet; sign in to the web app once).`);

  const server = new McpServer(MCP_SERVER_INFO, { instructions: MCP_INSTRUCTIONS });
  registerTools(server, userId);
  await server.connect(new StdioServerTransport());
  console.error(`[eod-mcp] ready for ${me.email} (${me.orgId})`);
}

main().catch((err) => die(err instanceof Error ? err.stack ?? err.message : String(err)));
