import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.4";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";
const LETTERS = ["A", "B", "C", "D"] as const;

function json(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function deriveSecret(key: string) {
  const data = new TextEncoder().encode(`telegram-webhook:${key}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64Url(new Uint8Array(digest));
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

async function tg(method: string, body: unknown) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");
  if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY) {
    throw new Error("Telegram connector keys missing");
  }

  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(`${GATEWAY_URL}/${method}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": TELEGRAM_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let data: unknown;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { ok: false, raw: text };
      }
      if (res.ok || res.status < 500 || attempt === 3) {
        if (!res.ok) console.error(`tg ${method} failed`, res.status, data);
        return data;
      }
    } catch (err) {
      lastErr = err;
      if (attempt === 3) break;
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
  }
  return { ok: false, error: String(lastErr) };
}

function admin() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Backend service credentials missing");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function isAllowed(chatId: number) {
  const { data } = await admin().from("bot_users").select("chat_id").eq("chat_id", chatId).maybeSingle();
  return !!data;
}

async function tryRedeemInvite(chatId: number, username: string | null, code: string) {
  const db = admin();
  const { data: invite } = await db.from("invites").select("code,uses").eq("code", code).maybeSingle();
  if (!invite) return false;
  await db.from("bot_users").upsert({ chat_id: chatId, username, invite_code: code });
  await db.from("invites").update({ uses: (invite.uses ?? 0) + 1 }).eq("code", code);
  return true;
}

async function getState(chatId: number) {
  const { data } = await admin().from("user_state").select("*").eq("chat_id", chatId).maybeSingle();
  return data;
}

async function setState(chatId: number, patch: Record<string, unknown>) {
  await admin().from("user_state").upsert({ chat_id: chatId, ...patch, updated_at: new Date().toISOString() });
}

async function bumpScore(chatId: number, username: string | null, correct: boolean) {
  const db = admin();
  const { data } = await db.from("user_scores").select("total,correct").eq("chat_id", chatId).maybeSingle();
  const total = (data?.total ?? 0) + 1;
  const ok = (data?.correct ?? 0) + (correct ? 1 : 0);
  await db.from("user_scores").upsert({ chat_id: chatId, username, total, correct: ok, updated_at: new Date().toISOString() });
  return { total, correct: ok };
}

async function pickQuestion(subject: string | null, topic: string | null) {
  let query = admin().from("questions").select("id");
  if (subject) query = query.eq("subject", subject);
  if (topic) query = query.eq("topic", topic);
  const idsRes = await query;
  const ids = (idsRes.data ?? []) as { id: number }[];
  if (!ids.length) return null;
  const pick = ids[Math.floor(Math.random() * ids.length)].id;
  const { data } = await admin().from("questions").select("*").eq("id", pick).single();
  return data;
}

function quickMenu() {
  return {
    inline_keyboard: [
      [
        { text: "Next random", callback_data: "next:random" },
        { text: "Topics", callback_data: "menu:topics" },
      ],
      [
        { text: "ICTSM", callback_data: "subj:ICTSM" },
        { text: "Employability", callback_data: "subj:Employability" },
      ],
      [
        { text: "Score", callback_data: "menu:score" },
        { text: "Progress", callback_data: "menu:progress" },
      ],
      [
        { text: "Study plan", callback_data: "menu:plan" },
        { text: "Mode", callback_data: "menu:mode" },
      ],
    ],
  };
}

async function sendQuestion(chatId: number, subject: string | null, topic: string | null, mode: string) {
  const q = await pickQuestion(subject, topic);
  if (!q) {
    await tg("sendMessage", { chat_id: chatId, text: "No questions found." });
    return;
  }
  await setState(chatId, { mode, subject, topic, current_question_id: q.id });

  const correctIdx = LETTERS.indexOf(q.answer.toUpperCase() as (typeof LETTERS)[number]);
  const options = [q.option_a, q.option_b, q.option_c, q.option_d];

  if (mode === "poll") {
    const safeQ = q.question.length > 290 ? q.question.slice(0, 287) + "..." : q.question;
    const safeOpts = options.map((o: string) => (o.length > 95 ? o.slice(0, 92) + "..." : o));
    await tg("sendPoll", {
      chat_id: chatId,
      question: `[${q.subject} • ${q.topic}]\n${safeQ}`,
      options: safeOpts,
      type: "quiz",
      correct_option_id: correctIdx,
      is_anonymous: false,
    });
  } else {
    const text =
      `📚 *${q.subject}* — _${q.topic}_\n\n` +
      `${q.question}\n\n` +
      LETTERS.map((L, i) => `*${L}.* ${options[i]}`).join("\n");
    await tg("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [LETTERS.map((L) => ({ text: L, callback_data: `ans:${q.id}:${L}` }))] },
    });
  }
}

async function sendTopicsMenu(chatId: number, subject?: string) {
  let query = admin().from("questions").select("subject,topic");
  if (subject) query = query.eq("subject", subject);
  const { data } = await query;
  const seen = new Set<string>();
  const topics: { subject: string; topic: string }[] = [];
  for (const r of (data ?? []) as { subject: string; topic: string }[]) {
    const key = `${r.subject}|${r.topic}`;
    if (!seen.has(key)) {
      seen.add(key);
      topics.push(r);
    }
  }
  topics.sort((a, b) => (a.subject === b.subject ? a.topic.localeCompare(b.topic) : a.subject.localeCompare(b.subject)));
  const rows = topics.map((t) => [{ text: `${t.subject === "ICTSM" ? "📚" : "💼"} ${t.topic}`, callback_data: `topic:${t.subject}:${t.topic}` }]);
  await tg("sendMessage", {
    chat_id: chatId,
    text: subject ? `🗂 *${subject} topics* — pick one:` : "🗂 *Pick a topic:*",
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: rows },
  });
}

async function sendScore(chatId: number) {
  const { data } = await admin().from("user_scores").select("total,correct").eq("chat_id", chatId).maybeSingle();
  const total = data?.total ?? 0;
  const correct = data?.correct ?? 0;
  const pct = total ? Math.round((correct / total) * 100) : 0;
  await tg("sendMessage", {
    chat_id: chatId,
    text: `*Your score*\n\nAnswered: *${total}*\nAccuracy: *${pct}%*`,
    parse_mode: "Markdown",
    reply_markup: quickMenu(),
  });
}


async function sendProgress(chatId: number) {
  const db = admin();
  const [{ data: score }, { data: state }] = await Promise.all([
    db.from("user_scores").select("total,correct").eq("chat_id", chatId).maybeSingle(),
    db.from("user_state").select("mode,subject,topic").eq("chat_id", chatId).maybeSingle(),
  ]);
  const total = score?.total ?? 0;
  const correct = score?.correct ?? 0;
  const pct = total ? Math.round((correct / total) * 100) : 0;
  const focus = state?.topic ? `${state.subject ?? "Mixed"} / ${state.topic}` : state?.subject ?? "Mixed practice";
  const modeLabel = state?.mode === "button" ? "Inline buttons" : "Quiz polls";
  const nextTip = pct >= 80 ? "Strong run. Keep speed high with /random." : pct >= 50 ? "Good base. Drill one weak topic from /topics." : "Start with /ictsm or /employability and build accuracy slowly.";

  await tg("sendMessage", {
    chat_id: chatId,
    text: `*Progress snapshot*\n\nAccuracy: *${pct}%*\nAnswered: *${total}*\nFocus: *${focus}*\nMode: *${modeLabel}*\n\n${nextTip}`,
    parse_mode: "Markdown",
    reply_markup: quickMenu(),
  });
}

async function sendStudyPlan(chatId: number) {
  await tg("sendMessage", {
    chat_id: chatId,
    text:
      "*Today plan: 15 minutes*\n\n" +
      "1. Warm up with /random for 5 questions.\n" +
      "2. Open /topics and drill one weak topic.\n" +
      "3. Check /progress, then repeat missed areas.\n\n" +
      "Tip: use /mode and choose Inline Buttons when you want score tracking.",
    parse_mode: "Markdown",
    reply_markup: quickMenu(),
  });
}

async function sendModeMenu(chatId: number) {
  await tg("sendMessage", {
    chat_id: chatId,
    text: "Choose your quiz mode:",
    reply_markup: { inline_keyboard: [[{ text: "📊 Quiz Polls", callback_data: "mode:poll" }, { text: "🔘 Inline Buttons", callback_data: "mode:button" }]] },
  });
}

function welcomeText() {
  return (
    "👋 *Welcome to Study Bot!*\n\n" +
    "Practice MCQs from your 2nd year syllabus.\n\n" +
    "*Commands:*\n" +
    "/ictsm — random ICTSM question\n" +
    "/employability — random Employability question\n" +
    "/random — random from any subject\n" +
    "/topics — browse 20 topics\n" +
    "/mode — switch between quiz polls or buttons\n" +
    "/score — your score\n" +
    "/progress - accuracy, focus and next step\n" +    "/plan - 15 minute study routine\n" +
    "/reset — reset your score\n"
  );
}

async function handleCommand(chatId: number, username: string | null, text: string) {
  const cmd = text.split(/\s+/)[0].toLowerCase().split("@")[0];
  const state = await getState(chatId);
  const mode = state?.mode ?? "poll";

  switch (cmd) {
    case "/start":
    case "/help":
      await tg("sendMessage", { chat_id: chatId, text: welcomeText(), parse_mode: "Markdown", reply_markup: quickMenu() });
      return;
    case "/mode":
      await sendModeMenu(chatId);
      return;
    case "/topics":
      await sendTopicsMenu(chatId);
      return;
    case "/ictsm":
      await sendQuestion(chatId, "ICTSM", null, mode);
      return;
    case "/employability":
      await sendQuestion(chatId, "Employability", null, mode);
      return;
    case "/random":
      await sendQuestion(chatId, null, null, mode);
      return;
    case "/score":
      await sendScore(chatId);
      return;
    case "/progress":
      await sendProgress(chatId);
      return;
    case "/plan":
      await sendStudyPlan(chatId);
      return;

    case "/reset":
      await admin().from("user_scores").upsert({ chat_id: chatId, username, total: 0, correct: 0, updated_at: new Date().toISOString() });
      await tg("sendMessage", { chat_id: chatId, text: "✅ Score reset." });
      return;
    default:
      await tg("sendMessage", { chat_id: chatId, text: "Unknown command. Send /help to see options.", reply_markup: quickMenu() });
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");
  if (!TELEGRAM_API_KEY) return new Response("TELEGRAM_API_KEY missing", { status: 500 });

  const expected = await deriveSecret(TELEGRAM_API_KEY);
  const got = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
  if (!safeEqual(got, expected)) return new Response("Unauthorized", { status: 401 });

  try {
    const update = await request.json();
    const msg = update.message ?? update.edited_message;
    const cb = update.callback_query;
    const chatId: number | undefined = msg?.chat?.id ?? cb?.message?.chat?.id;
    const username: string | null = msg?.from?.username ?? msg?.from?.first_name ?? cb?.from?.username ?? cb?.from?.first_name ?? null;
    if (!chatId) return json({ ok: true });

    const allowed = await isAllowed(chatId);
    if (!allowed) {
      if (msg && typeof msg.text === "string") {
        const parts = msg.text.trim().split(/\s+/);
        if (parts[0].toLowerCase().startsWith("/start") && parts[1]) {
          const ok = await tryRedeemInvite(chatId, username, parts[1]);
          if (ok) {
            await tg("sendMessage", { chat_id: chatId, text: "🎉 Access granted!\n\n" + welcomeText(), parse_mode: "Markdown", reply_markup: quickMenu() });
            return json({ ok: true });
          }
        }
      }
      if (cb?.id) await tg("answerCallbackQuery", { callback_query_id: cb.id, text: "Access required", show_alert: true });
      await tg("sendMessage", { chat_id: chatId, text: "🔒 *This bot is private.*\n\nOpen the invite link your friend shared to unlock it.", parse_mode: "Markdown" });
      return json({ ok: true });
    }

    if (msg && typeof msg.text === "string") {
      if (msg.text.startsWith("/")) await handleCommand(chatId, username, msg.text);
      else {
        const normalized = msg.text.trim().toLowerCase();
        if (["score", "progress", "plan", "topics"].includes(normalized)) {
          await handleCommand(chatId, username, "/" + normalized);
        } else {
          await tg("sendMessage", { chat_id: chatId, text: "Send /help to see commands, or type score, topics, progress, or plan.", reply_markup: quickMenu() });
        }
      }
    }

    if (cb?.data && cb.message?.chat?.id) {
      const data = cb.data as string;
      if (data.startsWith("mode:")) {
        const newMode = data.split(":")[1];
        await setState(chatId, { mode: newMode });
        await tg("answerCallbackQuery", { callback_query_id: cb.id, text: `Mode: ${newMode}` });
        await tg("sendMessage", { chat_id: chatId, text: `✅ Mode set to *${newMode === "poll" ? "Quiz Polls" : "Inline Buttons"}*. Try /random.`, parse_mode: "Markdown", reply_markup: quickMenu() });
      } else if (data === "menu:topics") {
        await tg("answerCallbackQuery", { callback_query_id: cb.id });
        await sendTopicsMenu(chatId);
      } else if (data === "menu:score") {
        await tg("answerCallbackQuery", { callback_query_id: cb.id });
        await sendScore(chatId);
      } else if (data === "menu:progress") {
        await tg("answerCallbackQuery", { callback_query_id: cb.id });
        await sendProgress(chatId); else if (data === "menu:plan") {
        await tg("answerCallbackQuery", { callback_query_id: cb.id });
        await sendStudyPlan(chatId);
      } else if (data === "menu:mode") {
        await tg("answerCallbackQuery", { callback_query_id: cb.id });
        await sendModeMenu(chatId);
      } else if (data === "next:random") {
        await tg("answerCallbackQuery", { callback_query_id: cb.id });
        const st = await getState(chatId);
        await sendQuestion(chatId, null, null, st?.mode ?? "poll");
      } else if (data.startsWith("subj:")) {
        const subj = data.slice("subj:".length);
        await tg("answerCallbackQuery", { callback_query_id: cb.id });
        await sendTopicsMenu(chatId, subj);
      } else if (data.startsWith("topic:")) {
        const rest = data.slice("topic:".length);
        const sep = rest.indexOf(":");
        const subj = rest.slice(0, sep);
        const topic = rest.slice(sep + 1);
        await tg("answerCallbackQuery", { callback_query_id: cb.id });
        const st = await getState(chatId);
        await sendQuestion(chatId, subj, topic, st?.mode ?? "poll");
      } else if (data.startsWith("ans:")) {
        const [, qidStr, letter] = data.split(":");
        const qid = Number(qidStr);
        const { data: q } = await admin().from("questions").select("*").eq("id", qid).single();
        if (q) {
          const correct = letter.toUpperCase() === q.answer.toUpperCase();
          const opts = [q.option_a, q.option_b, q.option_c, q.option_d];
          const correctText = opts[LETTERS.indexOf(q.answer.toUpperCase() as (typeof LETTERS)[number])];
          const score = await bumpScore(chatId, username, correct);
          const pct = score.total ? Math.round((score.correct / score.total) * 100) : 0;
          await tg("answerCallbackQuery", { callback_query_id: cb.id, text: correct ? "✅ Correct!" : "❌ Wrong", show_alert: false });
          await tg("sendMessage", { chat_id: chatId, text: (correct ? "✅ *Correct!*" : `❌ *Wrong.* Answer: *${q.answer}* — ${correctText}`) + `\n\nAccuracy: ${pct}% after ${score.total} answered`, parse_mode: "Markdown", reply_markup: quickMenu() });
          const st = await getState(chatId);
          await sendQuestion(chatId, st?.subject ?? null, st?.topic ?? null, st?.mode ?? "button");
        } else {
          await tg("answerCallbackQuery", { callback_query_id: cb.id });
        }
      } else {
        await tg("answerCallbackQuery", { callback_query_id: cb.id });
      }
    }
  } catch (err) {
    console.error("telegram webhook error", err);
  }

  return json({ ok: true });
});
