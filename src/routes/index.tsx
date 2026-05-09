import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getInviteLink } from "@/lib/invite.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Copy, Check, ExternalLink, Bot, BookOpen, Send } from "lucide-react";

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

  const handleCopy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800">
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24 animate-in fade-in slide-in-from-bottom-4 duration-700">
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
          <Card className="border-border/50 shadow-md transition-all hover:shadow-lg bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="w-5 h-5 text-blue-500" />
                Telegram Access
              </CardTitle>
              <CardDescription>
                Get your private invite link to launch the bot.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col space-y-4">
                <div className="flex items-center space-x-2 bg-muted/50 p-3 rounded-lg border border-border/50 overflow-hidden relative">
                  <span className="text-sm font-mono truncate flex-1 opacity-80">
                    {isLoading ? "Generating secure link..." : (link || "No link available")}
                  </span>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col sm:flex-row gap-3">
              <Button 
                variant="outline" 
                className="w-full sm:w-auto transition-all active:scale-95 hover:bg-muted"
                disabled={!link || isLoading}
                onClick={handleCopy}
              >
                {copied ? (
                  <><Check className="w-4 h-4 mr-2 text-green-500" /> Copied</>
                ) : (
                  <><Copy className="w-4 h-4 mr-2" /> Copy Link</>
                )}
              </Button>
              <Button 
                className="w-full sm:w-auto transition-all active:scale-95 bg-[#0088cc] hover:bg-[#0077b3] text-white"
                disabled={!link || isLoading}
                asChild
              >
                <a href={link || "#"} target="_blank" rel="noreferrer">
                  <ExternalLink className="w-4 h-4 mr-2" /> Launch in Telegram
                </a>
              </Button>
            </CardFooter>
          </Card>

          <Card className="border-border/50 shadow-md transition-all hover:shadow-lg bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary" />
                Bot Commands
              </CardTitle>
              <CardDescription>
                640+ questions across 20 topics loaded.
              </CardDescription>
            </CardHeader>
            <CardContent>
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
