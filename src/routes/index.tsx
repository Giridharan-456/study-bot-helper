import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getInviteLink } from "@/lib/invite.functions";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const fetchInvite = useServerFn(getInviteLink);
  const { data } = useQuery({
    queryKey: ["invite-link"],
    queryFn: () => fetchInvite(),
  });
  const [copied, setCopied] = useState(false);
  const link = data?.url ?? "";

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted">
      <main className="mx-auto max-w-2xl px-6 py-20">
        <div className="text-6xl mb-6">📚</div>
        <h1 className="text-4xl font-bold tracking-tight text-foreground">
          Study Bot
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Practice 2nd-year MCQs on Telegram — ICTSM &amp; Employability Skills.
        </p>

        <section className="mt-8 rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Your invite link
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            🔒 The bot is private. Anyone who opens this link gets access.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <code className="flex-1 truncate rounded-md bg-muted px-3 py-2 text-sm">
              {link || "Loading…"}
            </code>
            <button
              type="button"
              disabled={!link}
              onClick={async () => {
                await navigator.clipboard.writeText(link);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
            <a
              href={link || "#"}
              target="_blank"
              rel="noreferrer"
              className="rounded-md bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Open
            </a>
          </div>
        </section>

        <section className="mt-12 rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-card-foreground">Bot commands</h2>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            <li><code className="rounded bg-muted px-1.5 py-0.5">/start</code> — welcome &amp; help</li>
            <li><code className="rounded bg-muted px-1.5 py-0.5">/ictsm</code> — random ICTSM question</li>
            <li><code className="rounded bg-muted px-1.5 py-0.5">/employability</code> — random Employability question</li>
            <li><code className="rounded bg-muted px-1.5 py-0.5">/random</code> — random from any subject</li>
            <li><code className="rounded bg-muted px-1.5 py-0.5">/mode</code> — switch quiz polls ↔ inline buttons</li>
            <li><code className="rounded bg-muted px-1.5 py-0.5">/score</code> — your accuracy</li>
            <li><code className="rounded bg-muted px-1.5 py-0.5">/reset</code> — reset score</li>
          </ul>
        </section>

        <p className="mt-8 text-xs text-muted-foreground">
          640 questions loaded across 20 topics.
        </p>
      </main>
    </div>
  );
}
