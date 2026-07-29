import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const SCHEMA_PATH = join(process.cwd(), "docs", "database-schema.md");

// Reads the hand-maintained schema doc at request time, so edits show on refresh.
export async function readSchemaDoc(): Promise<string> {
  try {
    return await readFile(SCHEMA_PATH, "utf8");
  } catch {
    return "# Database schema\n\n_Could not read `docs/database-schema.md`._";
  }
}
