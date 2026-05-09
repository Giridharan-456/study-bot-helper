import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const getInviteLink = createServerFn({ method: "GET" }).handler(async () => {
  const { data } = await supabaseAdmin
    .from("invites")
    .select("code")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const code = data?.code ?? "";
  return {
    code,
    url: code ? `https://t.me/Studyictsm_bot?start=${code}` : "",
  };
});