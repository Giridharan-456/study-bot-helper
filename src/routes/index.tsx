import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
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

        <a
          href="https://t.me/Studyictsm_bot"
          target="_blank"
          rel="noreferrer"
          className="mt-8 inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Open @Studyictsm_bot →
        </a>

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
