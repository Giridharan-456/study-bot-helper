import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const getLeaderboard = createServerFn({ method: "GET" }).handler(async () => {
  const { data } = await supabaseAdmin
    .from("user_scores")
    .select("username,correct,total")
    .order("correct", { ascending: false })
    .limit(5);

  return data || [];
});

export const getStats = createServerFn({ method: "GET" }).handler(async () => {
  const { count: usersCount } = await supabaseAdmin
    .from("bot_users")
    .select("*", { count: "exact", head: true });

  const { count: questionsCount } = await supabaseAdmin
    .from("questions")
    .select("*", { count: "exact", head: true });

  return {
    usersCount: usersCount || 0,
    questionsCount: questionsCount || 0,
  };
});
