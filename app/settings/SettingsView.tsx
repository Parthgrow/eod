"use client";

import { useActionState, useState } from "react";
import { createMcpToken, revokeMcpToken, type CreateTokenState } from "@/app/actions/mcp";

const inputCls =
  "rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2 text-sm outline-none focus:border-black dark:focus:border-white";
const btnCls =
  "rounded-full bg-black dark:bg-white text-white dark:text-black px-4 py-2 text-sm font-medium disabled:opacity-50";
const cardCls = "rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4";

type TokenRow = { id: string; name: string; hint: string; createdAt: number };

function CopyBlock({ label, help, value }: { label: string; help: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-black dark:text-zinc-50">{label}</span>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="text-xs text-zinc-500 hover:text-black dark:hover:text-white"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto rounded-lg bg-zinc-100 dark:bg-zinc-800 p-3 text-xs text-black dark:text-zinc-100 whitespace-pre-wrap break-all">
        {value}
      </pre>
      <p className="text-xs text-zinc-500">{help}</p>
    </div>
  );
}

export default function SettingsView({
  origin,
  userId,
  tokens,
}: {
  origin: string;
  userId: string;
  tokens: TokenRow[];
}) {
  const [state, action, pending] = useActionState<CreateTokenState, FormData>(createMcpToken, undefined);
  const [name, setName] = useState("");

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Let Claude (Claude Code, claude.ai, and the desktop and mobile apps) read and update your EODs, tickets and
        projects. Generate a token, then add it to Claude.
      </p>

      <form
        action={(fd) => {
          action(fd);
          setName("");
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <input
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Token name, e.g. Laptop"
          maxLength={60}
          className={inputCls}
        />
        <button type="submit" disabled={pending || !name.trim()} className={btnCls}>
          {pending ? "Generating..." : "Generate token"}
        </button>
        {state?.error && <span className="text-sm text-red-600 dark:text-red-400">{state.error}</span>}
      </form>

      {state?.token && (
        <div className={`${cardCls} flex flex-col gap-4`} data-testid="new-token">
          <p className="text-sm text-black dark:text-zinc-50">
            Token &ldquo;<span className="font-medium">{state.name}</span>&rdquo; created. Copy it now: it won&apos;t be
            shown again.
          </p>
          <CopyBlock label="Token" help="Keep this secret." value={state.token} />
          <CopyBlock
            label="Claude Code"
            help="Run this in a terminal."
            value={`claude mcp add --transport http eod ${origin}/api/mcp --header "Authorization: Bearer ${state.token}"`}
          />
          <CopyBlock
            label="claude.ai, desktop and mobile apps"
            help="Settings → Connectors → Add custom connector. Paste this URL and leave authentication empty. The URL contains your token, so don't share it."
            value={`${origin}/api/mcp/${state.token}`}
          />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-black dark:text-zinc-50">Your tokens</h2>
        {tokens.length === 0 ? (
          <p className="text-sm text-zinc-500">No tokens yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {tokens.map((t) => (
              <li key={t.id} className={`${cardCls} flex items-center justify-between gap-4`}>
                <div>
                  <p className="text-sm text-black dark:text-zinc-50">{t.name}</p>
                  <p className="text-xs text-zinc-500">
                    <code>{t.hint}…</code> · created {new Date(t.createdAt).toISOString().slice(0, 10)}
                  </p>
                </div>
                <form action={revokeMcpToken}>
                  <input type="hidden" name="tokenId" value={t.id} />
                  <button
                    type="submit"
                    className="text-sm text-red-600 dark:text-red-400 hover:underline"
                    aria-label={`Revoke ${t.name}`}
                  >
                    Revoke
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={`${cardCls} flex flex-col gap-1`}>
        <h2 className="text-sm font-medium text-black dark:text-zinc-50">Local server (stdio)</h2>
        <p className="text-xs text-zinc-500">
          To run the MCP server from a checkout of this repo, set <code>EOD_USER_ID</code> in <code>.env</code> to your
          user id (see the README):
        </p>
        <code className="text-xs text-black dark:text-zinc-100 break-all" data-testid="user-id">
          {userId}
        </code>
      </div>
    </div>
  );
}
