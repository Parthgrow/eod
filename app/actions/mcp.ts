"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { createToken, revokeToken } from "@/lib/mcp/auth";

export type CreateTokenState =
  | { token: string; name: string; error?: undefined }
  | { error: string; token?: undefined }
  | undefined;

export async function createMcpToken(_prev: CreateTokenState, formData: FormData): Promise<CreateTokenState> {
  const session = await getSession();
  if (!session?.orgId) return { error: "Your session expired. Sign in again." };

  const name = String(formData.get("name") ?? "");
  const result = await createToken(session.userId, name);
  if ("error" in result) return { error: result.error };

  revalidatePath("/settings");
  // The raw token is returned once, here, and never stored.
  return { token: result.token, name: result.info.name };
}

export async function revokeMcpToken(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session?.orgId) return;

  const tokenId = String(formData.get("tokenId") ?? "");
  if (tokenId) await revokeToken(session.userId, tokenId);
  revalidatePath("/settings");
}
