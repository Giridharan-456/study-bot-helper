import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getInviteLink } from "@/lib/invite.functions";
import { getLeaderboard, getStats } from "@/lib/stats.functions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Copy,
  Check,
  ExternalLink,
  Bot,
  BookOpen,
  Send,
  Share2,
  Trophy,
  Star,
  RotateCcw,
  Users,
  GraduationCap,
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const fetchInvite = useServerFn(getInviteLink);
  const fetchLeaderboard = useServerFn(getLeaderboard);
  const fetchStats = useServerFn(getStats);

  const { data: inviteData, isLoading: isLoadingInvite } = useQuery({
    queryKey: ["invite-link"],
    queryFn: () => fetchInvite(),
  });

  const { data: leaderboardData } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: () => fetchLeaderboard(),
  });

  const { data: statsData } = useQuery({
    queryKey: ["stats"],
    queryFn: () => fetchStats(),
  });

  const [copied, setCopied] = useState(false);
  const link = inviteData?.url ?? "";
  const botLink = "https://t.me/Studyictsm_bot";

  const handleCopy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareTelegram = () => {
    const text = encodeURIComponent("Join me on Study Bot to practice ICTSM & Employability MCQs!");
    window.open(`https://t.me/share/url?url=${encodeURIComponent(botLink)}&text=${text}`, "_blank");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800">
      <main className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="flex flex-col items-center text-center mb-12">
          <div className="bg-primary/10 p-4 rounded-2xl mb-6 shadow-sm ring-1 ring-primary/20 hover:scale-105 transition-transform duration-300">
            <Bot className="w-16 h-16 text-primary" />
          </div>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-foreground mb-4 bg-clip-text text-transparent bg-gradient-to-r from-primary to-purple-600">
            Study Bot
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl">
            Your personal AI-powered study companion. Master ICTSM & Employability Skills with over
            640+ interactive MCQs on Telegram.
          </p>

          <div className="flex gap-4 mt-8 flex-wrap justify-center">
            <div className="flex items-center gap-2 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm px-4 py-2 rounded-full border border-border/50 shadow-sm">
              <Users className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">{statsData?.usersCount || "..."} Students</span>
            </div>
            <div className="flex items-center gap-2 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm px-4 py-2 rounded-full border border-border/50 shadow-sm">
              <GraduationCap className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">
                {statsData?.questionsCount || "..."} Questions
              </span>
            </div>
          </div>
        </div>

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          <Card className="md:col-span-2 lg:col-span-1 border-border/50 shadow-md hover:shadow-xl transition-shadow duration-150 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="w-5 h-5 text-blue-500" />
                Telegram Access
              </CardTitle>
              <CardDescription>Get your private invite link to launch the bot.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="flex flex-col space-y-4">
                <div className="flex items-center space-x-2 bg-muted/50 p-3 rounded-lg border border-border/50 overflow-hidden relative">
                  <span className="text-sm font-mono truncate flex-1 opacity-80">
                    {isLoadingInvite ? "Generating secure link..." : link || "No link available"}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    disabled={!link || isLoadingInvite}
                    onClick={handleCopy}
                    className="group relative inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl font-semibold text-sm border border-border/70 bg-white/70 dark:bg-slate-800/70 text-foreground backdrop-blur-sm shadow-sm hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.97] transition-[transform,box-shadow,background-color] duration-100 ease-out disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-500" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" /> Copy
                      </>
                    )}
                  </button>
                  <a
                    href={link || "#"}
                    target="_blank"
                    rel="noreferrer"
                    aria-disabled={!link || isLoadingInvite}
                    onClick={(e) => {
                      if (!link || isLoadingInvite) e.preventDefault();
                    }}
                    className="group relative inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl font-semibold text-sm text-white shadow-md shadow-sky-500/30 bg-gradient-to-br from-sky-400 via-sky-500 to-blue-600 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-sky-500/40 active:translate-y-0 active:scale-[0.97] transition-[transform,box-shadow] duration-100 ease-out aria-disabled:opacity-50 aria-disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 overflow-hidden"
                  >
                    <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-500 ease-out bg-gradient-to-r from-transparent via-white/25 to-transparent" />
                    <ExternalLink className="w-4 h-4 relative" />{" "}
                    <span className="relative">Launch</span>
                  </a>
                  <button
                    type="button"
                    onClick={handleShareTelegram}
                    className="group relative inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl font-semibold text-sm text-white shadow-md shadow-fuchsia-500/30 bg-gradient-to-br from-fuchsia-500 via-purple-500 to-indigo-600 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-fuchsia-500/40 active:translate-y-0 active:scale-[0.97] transition-[transform,box-shadow] duration-100 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400"
                  >
                    <Share2 className="w-4 h-4" /> Share
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-md transition-all hover:shadow-lg bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary" />
                Bot Commands
              </CardTitle>
              <CardDescription>Features and commands to master your exams.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto max-h-[400px] scrollbar-thin">
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors">
                  <code className="rounded-md bg-primary/10 text-primary font-bold px-2.5 py-1 text-xs">
                    /start
                  </code>
                  <span>Welcome & help menu</span>
                </li>
                <li className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors">
                  <code className="rounded-md bg-primary/10 text-primary font-bold px-2.5 py-1 text-xs">
                    /ictsm
                  </code>
                  <span>Random ICTSM question</span>
                </li>
                <li className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors">
                  <code className="rounded-md bg-primary/10 text-primary font-bold px-2.5 py-1 text-xs">
                    /employability
                  </code>
                  <span>Random Employability question</span>
                </li>
                <li className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors">
                  <code className="rounded-md bg-primary/10 text-primary font-bold px-2.5 py-1 text-xs">
                    /topics
                  </code>
                  <span>Browse all topics</span>
                </li>
                <li className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 transition-colors group">
                  <div className="flex items-center gap-3">
                    <code className="rounded-md bg-emerald-500/10 text-emerald-600 font-bold px-2.5 py-1 text-xs">
                      /bookmarks
                    </code>
                    <span>Review starred questions</span>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-[10px] uppercase tracking-wider bg-emerald-50 text-emerald-600 border-emerald-200"
                  >
                    New
                  </Badge>
                </li>
                <li className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 transition-colors group">
                  <div className="flex items-center gap-3">
                    <code className="rounded-md bg-amber-500/10 text-amber-600 font-bold px-2.5 py-1 text-xs">
                      /review
                    </code>
                    <span>Practice wrong answers</span>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-[10px] uppercase tracking-wider bg-amber-50 text-amber-600 border-amber-200"
                  >
                    New
                  </Badge>
                </li>
                <li className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors">
                  <code className="rounded-md bg-primary/10 text-primary font-bold px-2.5 py-1 text-xs">
                    /top
                  </code>
                  <span>Check leaderboard</span>
                </li>
                <li className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors">
                  <code className="rounded-md bg-primary/10 text-primary font-bold px-2.5 py-1 text-xs">
                    /score
                  </code>
                  <span>Check your accuracy</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-md transition-all hover:shadow-lg bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-500" />
                Top Students
              </CardTitle>
              <CardDescription>Top performers this week.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="space-y-4">
                {leaderboardData?.map((user, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/30 border border-border/30"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                        {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                      </div>
                      <span className="text-sm font-semibold truncate max-w-[100px]">
                        {user.username || "Anonymous"}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-primary">{user.correct}</div>
                      <div className="text-[10px] text-muted-foreground">correct</div>
                    </div>
                  </div>
                ))}
                {!leaderboardData?.length && (
                  <div className="text-center py-8 text-sm text-muted-foreground italic">
                    Start practicing to see your name here!
                  </div>
                )}
              </div>
            </CardContent>
            <CardFooter className="pt-4 border-t border-border/50">
              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 w-full justify-center">
                <RotateCcw className="w-3 h-3" /> Updated in real-time
              </div>
            </CardFooter>
          </Card>
        </div>

        <section className="mt-20 text-center">
          <h2 className="text-2xl font-bold mb-8">What students say</h2>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="p-6 rounded-2xl bg-white/30 dark:bg-slate-800/30 border border-border/50 backdrop-blur-sm">
              <div className="flex justify-center mb-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <p className="text-sm italic text-muted-foreground mb-4">
                "The bookmark feature is a lifesaver! I can focus on my weak topics easily."
              </p>
              <p className="text-xs font-bold">— Rahul K.</p>
            </div>
            <div className="p-6 rounded-2xl bg-white/30 dark:bg-slate-800/30 border border-border/50 backdrop-blur-sm">
              <div className="flex justify-center mb-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <p className="text-sm italic text-muted-foreground mb-4">
                "Competing on the leaderboard with my classmates keeps me motivated."
              </p>
              <p className="text-xs font-bold">— Sneha M.</p>
            </div>
            <div className="p-6 rounded-2xl bg-white/30 dark:bg-slate-800/30 border border-border/50 backdrop-blur-sm">
              <div className="flex justify-center mb-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <p className="text-sm italic text-muted-foreground mb-4">
                "640+ questions! This is the most comprehensive study bot I've used."
              </p>
              <p className="text-xs font-bold">— Aman S.</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
