import Link from "next/link";
import { notFound } from "next/navigation";
import { marked } from "marked";
import { readSchemaDoc } from "@/lib/schema";

// Always re-read the file so edits to the .md show on refresh (no rebuild).
export const dynamic = "force-dynamic";

export default async function DatabaseSchemaPage() {
  // Local-only: this route simply doesn't exist in a production build.
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  const md = await readSchemaDoc();
  // Content is a trusted, first-party file we author, so rendering it is safe.
  const html = await marked.parse(md);

  return (
    <div className="flex flex-col flex-1 bg-zinc-50 font-sans dark:bg-black min-h-screen">
      <main className="flex flex-1 w-full max-w-4xl mx-auto flex-col gap-6 py-12 px-6">
        <div className="w-full flex items-center justify-between">
          <div>
            <h1 className="text-lg font-medium text-black dark:text-zinc-50">Database schema</h1>
            <p className="text-xs text-zinc-500">Local only · reads docs/database-schema.md</p>
          </div>
          <Link href="/" className="text-sm text-zinc-500 hover:text-black dark:hover:text-white">
            Back
          </Link>
        </div>
        <article
          className="prose prose-sm dark:prose-invert max-w-none prose-headings:font-medium prose-table:text-sm prose-code:text-xs"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </main>
    </div>
  );
}
