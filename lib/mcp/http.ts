import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { MCP_INSTRUCTIONS, MCP_SERVER_INFO, registerTools } from "@/lib/mcp/tools";

// Stateless Streamable HTTP: every POST gets a fresh server + transport, so
// nothing is kept between requests (fits serverless). JSON responses, no SSE.
export async function handleMcpRequest(req: Request, userId: string): Promise<Response> {
  const server = new McpServer(MCP_SERVER_INFO, { instructions: MCP_INSTRUCTIONS });
  registerTools(server, userId);

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    return await transport.handleRequest(req);
  } catch (err) {
    console.error("[mcp] request failed:", err);
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32603, message: "Internal server error." }, id: null },
      { status: 500 }
    );
  } finally {
    await server.close().catch(() => {});
  }
}

// Stateless servers have no SSE stream (GET) or session to end (DELETE).
export function methodNotAllowed(): Response {
  return Response.json(
    { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed. Use POST." }, id: null },
    { status: 405, headers: { Allow: "POST" } }
  );
}
