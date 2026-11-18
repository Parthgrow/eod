import { requireMcpUserId } from "@/lib/mcp/auth";
import { handleMcpRequest, methodNotAllowed } from "@/lib/mcp/http";

// Remote MCP endpoint (Streamable HTTP, stateless).
// Auth: `Authorization: Bearer <token>`, a token generated on /settings.
export async function POST(req: Request) {
  const userId = await requireMcpUserId(req);
  if (userId instanceof Response) return userId;
  return handleMcpRequest(req, userId);
}

export async function GET() {
  return methodNotAllowed();
}

export async function DELETE() {
  return methodNotAllowed();
}
