import { resolveToken } from "@/lib/mcp/auth";
import { handleMcpRequest, methodNotAllowed } from "@/lib/mcp/http";

// Same MCP endpoint, with the token in the path, for clients that can't send
// custom headers (claude.ai "Add custom connector" takes only a URL).
// The URL itself is the credential: treat it like a password, and revoke the
// token on /settings if it leaks.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const userId = await resolveToken(token);
  if (!userId) {
    // No WWW-Authenticate header on purpose: with one, clients go looking for an
    // OAuth authorization server, which this endpoint doesn't have.
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32001, message: "Invalid or revoked MCP token." }, id: null },
      { status: 401 }
    );
  }
  return handleMcpRequest(req, userId);
}

export async function GET() {
  return methodNotAllowed();
}

export async function DELETE() {
  return methodNotAllowed();
}
