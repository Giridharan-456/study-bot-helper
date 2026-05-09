import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getInviteLink } from "@/lib/invite.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Copy, Check, ExternalLink, Bot, BookOpen, Send, Share2 } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const fetchInvite = useServerFn(getInviteLink);
  const { data, isLoading } = useQuery({
    queryKey: ["invite-link"],
    queryFn: () => fetchInvite(),
  });
  
  const [copied, setCopied] = useState(false);
  const link = data?.url ?? "";
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
      <main className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-24 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="flex flex-col items-center text-center mb-12">
          <div className="bg-primary/10 p-4 rounded-2xl mb-6 shadow-sm ring-1 ring-primary/20 hover:scale-105 transition-transform duration-300">
            <Bot className="w-16 h-16 text-primary" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground mb-4">
            Study Bot
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-xl">
            Your personal AI-powered study companion. Practice ICTSM & Employability Skills directly on Telegram.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          <Card className="border-border/50 shadow-md hover:shadow-xl transition-shadow duration-150 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="w-5 h-5 text-blue-500" />
                Telegram Access
              </CardTitle>
              <CardDescription>
                Get your private invite link to launch the bot.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="flex flex-col space-y-4">
                <div className="flex items-center space-x-2 bg-muted/50 p-3 rounded-lg border border-border/50 overflow-hidden relative">
                  <span className="text-sm font-mono truncate flex-1 opacity-80">
                    {isLoading ? "Generating secure link..." : (link || "No link available")}
                  </span>
                </div>
              </div>
            </CardContent>
            <CardFooter className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-4 border-t border-border/50">
              <button
                type="button"
                disabled={!link || isLoading}
                onClick={handleCopy}
                className="group relative inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl font-semibold text-sm border border-border/70 bg-white/70 dark:bg-slate-800/70 text-foreground backdrop-blur-sm shadow-sm hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.97] transition-[transform,box-shadow,background-color] duration-100 ease-out disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              >
                {copied ? (
                  <><Check className="w-4 h-4 text-emerald-500" /> Copied</>
                ) : (
                  <><Copy className="w-4 h-4" /> Copy</>
                )}
              </button>
              <a
                href={link || "#"}
                target="_blank"
                rel="noreferrer"
                aria-disabled={!link || isLoading}
                onClick={(e) => { if (!link || isLoading) e.preventDefault(); }}
                className="group relative inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl font-semibold text-sm text-white shadow-md shadow-sky-500/30 bg-gradient-to-br from-sky-400 via-sky-500 to-blue-600 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-sky-500/40 active:translate-y-0 active:scale-[0.97] transition-[transform,box-shadow] duration-100 ease-out aria-disabled:opacity-50 aria-disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 overflow-hidden"
              >
                <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-500 ease-out bg-gradient-to-r from-transparent via-white/25 to-transparent" />
                <ExternalLink className="w-4 h-4 relative" /> <span className="relative">Launch</span>
              </a>
              <button
                type="button"
                onClick={handleShareTelegram}
                className="group relative inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl font-semibold text-sm text-white shadow-md shadow-fuchsia-500/30 bg-gradient-to-br from-fuchsia-500 via-purple-500 to-indigo-600 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-fuchsia-500/40 active:translate-y-0 active:scale-[0.97] transition-[transform,box-shadow] duration-100 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400"
              >
                <Share2 className="w-4 h-4" /> Share
              </button>
            </CardFooter>
          </Card>

          <Card className="border-border/50 shadow-md transition-all hover:shadow-lg bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary" />
                Bot Commands
              </CardTitle>
              <CardDescription>
                640+ questions across 20 topics loaded.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors">
                  <code className="rounded-md bg-primary/10 text-primary font-bold px-2.5 py-1 text-xs">/start</code>
                  <span>Welcome & help menu</span>
                </li>
                <li className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors">
                  <code className="rounded-md bg-primary/10 text-primary font-bold px-2.5 py-1 text-xs">/ictsm</code>
                  <span>Random ICTSM question</span>
                </li>
                <li className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors">
                  <code className="rounded-md bg-primary/10 text-primary font-bold px-2.5 py-1 text-xs">/employability</code>
                  <span>Random Employability question</span>
                </li>
                <li className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors">
                  <code className="rounded-md bg-primary/10 text-primary font-bold px-2.5 py-1 text-xs">/random</code>
                  <span>Mix from any subject</span>
                </li>
                <li className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors">
                  <code className="rounded-md bg-primary/10 text-primary font-bold px-2.5 py-1 text-xs">/topics</code>
                  <span>Browse all 20 topics</span>
                </li>
                <li className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors">
                  <code className="rounded-md bg-primary/10 text-primary font-bold px-2.5 py-1 text-xs">/score</code>
                  <span>Check your accuracy</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
