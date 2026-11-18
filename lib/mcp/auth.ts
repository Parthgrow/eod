import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { kv } from "@vercel/kv";
import { mcpTokenKey, userKey, userMcpTokensKey } from "@/lib/kv-keys";

// Personal access tokens for the MCP server. A token is "eod_" + 32 random
// bytes (base64url). Only its SHA-256 is stored, so a KV leak doesn't leak
// usable tokens; the raw value is shown to the user once, at creation.

export const MAX_TOKENS_PER_USER = 10;
const TOKEN_RE = /^eod_[A-Za-z0-9_-]{43}$/;
const MAX_NAME_LENGTH = 60;

export type McpTokenInfo = {
  id: string;
  name: string;
  hint: string; // first 8 chars of the token, e.g. "eod_AbCd"
  hash: string; // sha256 hex
  createdAt: number;
};

type TokenRecord = { userId: string; tokenId: string };

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function listTokens(userId: string): Promise<McpTokenInfo[]> {
  const all = await kv.hgetall<Record<string, McpTokenInfo>>(userMcpTokensKey(userId));
  return Object.values(all ?? {}).sort((a, b) => b.createdAt - a.createdAt);
}

export async function createToken(
  userId: string,
  name: string
): Promise<{ token: string; info: McpTokenInfo } | { error: string }> {
  const cleanName = name.trim().slice(0, MAX_NAME_LENGTH);
  if (!cleanName) return { error: "Give the token a name." };

  if ((await kv.hlen(userMcpTokensKey(userId))) >= MAX_TOKENS_PER_USER) {
    return { error: `You can have at most ${MAX_TOKENS_PER_USER} tokens. Revoke one first.` };
  }

  const token = `eod_${randomBytes(32).toString("base64url")}`;
  const hash = sha256(token);
  const info: McpTokenInfo = {
    id: randomUUID(),
    name: cleanName,
    hint: token.slice(0, 8),
    hash,
    createdAt: Date.now(),
  };

  await Promise.all([
    kv.set(mcpTokenKey(hash), { userId, tokenId: info.id } satisfies TokenRecord),
    kv.hset(userMcpTokensKey(userId), { [info.id]: info }),
  ]);
  return { token, info };
}

// Scoped to the caller: a tokenId that isn't in *their* hash is simply not found.
export async function revokeToken(userId: string, tokenId: string): Promise<boolean> {
  const info = await kv.hget<McpTokenInfo>(userMcpTokensKey(userId), tokenId);
  if (!info) return false;

  await Promise.all([kv.del(mcpTokenKey(info.hash)), kv.hdel(userMcpTokensKey(userId), tokenId)]);
  return true;
}

// Raw token → userId, or null if it's malformed, unknown, revoked, or its user is gone.
export async function resolveToken(raw: string | null | undefined): Promise<string | null> {
  if (!raw || !TOKEN_RE.test(raw)) return null;

  const record = await kv.get<TokenRecord>(mcpTokenKey(sha256(raw)));
  if (!record?.userId || !record.tokenId) return null;

  const [listed, userExists] = await Promise.all([
    kv.hexists(userMcpTokensKey(record.userId), record.tokenId),
    kv.exists(userKey(record.userId)),
  ]);
  return listed && userExists ? record.userId : null;
}

// For /api/mcp: reads `Authorization: Bearer <token>`. Returns the userId, or a
// 401 whose WWW-Authenticate header tells the client a bearer token is needed.
export async function requireMcpUserId(req: Request): Promise<string | Response> {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const userId = await resolveToken(match?.[1]?.trim());
  if (userId) return userId;

  return Response.json(
    { jsonrpc: "2.0", error: { code: -32001, message: "Missing or invalid MCP token." }, id: null },
    { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="eod-mcp"' } }
  );
}
