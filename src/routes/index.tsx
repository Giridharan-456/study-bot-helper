import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getInviteLink } from "@/lib/invite.functions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Bot,
  BookOpen,
  Check,
  ClipboardList,
  Copy,
  ExternalLink,
  ListChecks,
  Medal,
  Send,
  Share2,
  Sparkles,
  Target,
  Timer,
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

const botLink = "https://t.me/Studyictsm_bot";

const commands = [
  { command: "/start", label: "Open the welcome menu", tone: "bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  { command: "/ictsm", label: "Practice ICTSM questions", tone: "bg-violet-500/10 text-violet-700 dark:text-violet-300" },
  { command: "/employability", label: "Practice employability skills", tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  { command: "/random", label: "Mix every subject", tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  { command: "/topics", label: "Browse all topics", tone: "bg-rose-500/10 text-rose-700 dark:text-rose-300" },
  { command: "/score", label: "Check your accuracy", tone: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300" },
];

const highlights = [
  { icon: BookOpen, value: "640+", label: "practice questions" },
  { icon: ClipboardList, value: "20", label: "focused topics" },
  { icon: Medal, value: "2", label: "exam skill areas" },
];

const studyPlan = [
  "Warm up with /random for 5 questions.",
  "Drill the weakest topic from /topics.",
  "Finish with /score and repeat missed areas.",
];

function Index() {
  const fetchInvite = useServerFn(getInviteLink);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["invite-link"],
    queryFn: () => fetchInvite(),
  });

  const [copied, setCopied] = useState(false);
  const inviteLink = data?.url ?? "";
  const launchLink = inviteLink || botLink;
  const linkLabel = isLoading
    ? "Preparing Telegram link..."
    : inviteLink
      ? inviteLink
      : botLink;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(launchLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareTelegram = () => {
    const text = encodeURIComponent(
      "Practice ICTSM and Employability Skills MCQs with me on Study Bot.",
    );
    window.open(
      `https://t.me/share/url?url=${encodeURIComponent(launchLink)}&text=${text}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.16),transparent_32rem),linear-gradient(135deg,#f8fafc_0%,#ffffff_45%,#f0fdf4_100%)] text-foreground dark:bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.18),transparent_28rem),linear-gradient(135deg,#020617_0%,#111827_52%,#052e2b_100%)]">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <section className="grid items-center gap-8 py-8 lg:grid-cols-[1.05fr_0.95fr] lg:py-12">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/80 px-3 py-1 text-sm font-medium text-sky-700 shadow-sm dark:border-sky-900/70 dark:bg-slate-900/70 dark:text-sky-300">
              <Sparkles className="h-4 w-4" />
              Telegram study companion
            </div>
            <h1 className="max-w-3xl text-4xl font-extrabold tracking-tight text-slate-950 dark:text-white sm:text-5xl">
              Study Bot Helper
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600 dark:text-slate-300">
              Practice ICTSM and Employability Skills MCQs, jump into topic drills, and keep your
              revision loop moving from Telegram.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <a
                href={launchLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-sky-600 px-5 text-sm font-semibold text-white shadow-lg shadow-sky-600/25 transition hover:bg-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              >
                <Send className="h-4 w-4" />
                Launch bot
                <ExternalLink className="h-4 w-4" />
              </a>
              <button
                type="button"
                onClick={handleShareTelegram}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800"
              >
                <Share2 className="h-4 w-4" />
                Share on Telegram
              </button>
            </div>
          </div>

          <Card className="rounded-lg border-slate-200/80 bg-white/85 shadow-xl shadow-slate-200/50 backdrop-blur dark:border-slate-800 dark:bg-slate-950/75 dark:shadow-slate-950/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Bot className="h-5 w-5 text-sky-600" />
                Ready to study
              </CardTitle>
              <CardDescription>
                The helper uses the invite link when available and falls back to the public bot.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                <p className="truncate font-mono text-sm text-slate-700 dark:text-slate-300">
                  {linkLabel}
                </p>
                {isError ? (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                    Invite lookup is unavailable, so the direct Telegram bot link is active.
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                disabled={isLoading}
                onClick={handleCopy}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:pointer-events-none disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy active link"}
              </button>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          {highlights.map(({ icon: Icon, value, label }) => (
            <div
              key={label}
              className="rounded-lg border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/70"
            >
              <Icon className="h-5 w-5 text-sky-600" />
              <p className="mt-3 text-2xl font-bold text-slate-950 dark:text-white">{value}</p>
              <p className="text-sm text-slate-600 dark:text-slate-400">{label}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
          <Card className="rounded-lg border-slate-200/80 bg-white/85 shadow-sm dark:border-slate-800 dark:bg-slate-950/75">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ListChecks className="h-5 w-5 text-sky-600" />
                Quick commands
              </CardTitle>
              <CardDescription>Tap a command in Telegram or use these as your revision checklist.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                {commands.map((item) => (
                  <div
                    key={item.command}
                    className="rounded-lg border border-slate-200 bg-white p-3 transition hover:border-sky-200 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900"
                  >
                    <code className={`rounded-md px-2 py-1 text-xs font-bold ${item.tone}`}>
                      {item.command}
                    </code>
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{item.label}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-lg border-slate-200/80 bg-white/85 shadow-sm dark:border-slate-800 dark:bg-slate-950/75">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5 text-emerald-600" />
                15 minute study loop
              </CardTitle>
              <CardDescription>A simple routine for quick daily revision.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {studyPlan.map((step, index) => (
                <div key={step} className="flex gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-sm font-bold text-emerald-700 dark:text-emerald-300">
                    {index + 1}
                  </div>
                  <p className="text-sm leading-6 text-slate-700 dark:text-slate-300">{step}</p>
                </div>
              ))}
              <div className="flex items-center gap-2 rounded-lg bg-sky-500/10 p-3 text-sm text-sky-800 dark:text-sky-200">
                <Timer className="h-4 w-4" />
                Come back daily and track improvement with /score.
              </div>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
