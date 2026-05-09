import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

function deriveSecret(key: string) {
  return createHash("sha256").update(`telegram-webhook:${key}`).digest("base64url");
}
function safeEqual(a: string, b: string) {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
}

async function tg(method: string, body: unknown) {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const TELEGRAM_API_KEY = process.env.TELEGRAM_API_KEY;
  if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY) {
    throw new Error("Telegram connector keys missing");
  }
  const res = await fetch(`${GATEWAY_URL}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": TELEGRAM_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) console.error(`tg ${method} failed`, res.status, data);
  return data;
}

const LETTERS = ["A", "B", "C", "D"] as const;

async function isAllowed(chatId: number) {
  const { data } = await supabaseAdmin
    .from("bot_users")
    .select("chat_id")
    .eq("chat_id", chatId)
    .maybeSingle();
  return !!data;
}

async function tryRedeemInvite(chatId: number, username: string | null, code: string) {
  const { data: invite } = await supabaseAdmin
    .from("invites")
    .select("code,uses")
    .eq("code", code)
    .maybeSingle();
  if (!invite) return false;
  await supabaseAdmin
    .from("bot_users")
    .upsert({ chat_id: chatId, username, invite_code: code });
  await supabaseAdmin
    .from("invites")
    .update({ uses: (invite.uses ?? 0) + 1 })
    .eq("code", code);
  return true;
}

async function getState(chatId: number) {
  const { data } = await supabaseAdmin
    .from("user_state")
    .select("*")
    .eq("chat_id", chatId)
    .maybeSingle();
  return data;
}

async function setState(chatId: number, patch: Record<string, unknown>) {
  await supabaseAdmin
    .from("user_state")
    .upsert({ chat_id: chatId, ...patch, updated_at: new Date().toISOString() });
}

async function bumpScore(chatId: number, username: string | null, correct: boolean) {
  const { data } = await supabaseAdmin
    .from("user_scores")
    .select("total,correct")
    .eq("chat_id", chatId)
    .maybeSingle();
  const total = (data?.total ?? 0) + 1;
  const ok = (data?.correct ?? 0) + (correct ? 1 : 0);
  await supabaseAdmin
    .from("user_scores")
    .upsert({ chat_id: chatId, username, total, correct: ok, updated_at: new Date().toISOString() });
  return { total, correct: ok };
}

async function pickQuestion(subject: string | null, topic: string | null) {
  let query = supabaseAdmin.from("questions").select("id");
  if (subject) query = query.eq("subject", subject);
  if (topic) query = query.eq("topic", topic);
  const idsRes = await query;
  const ids = (idsRes.data ?? []) as { id: number }[];
  if (!ids.length) return null;
  const pick = ids[Math.floor(Math.random() * ids.length)].id;
  const { data } = await supabaseAdmin.from("questions").select("*").eq("id", pick).single();
  return data;
}

function quickMenu() {
  return {
    inline_keyboard: [
      [
        { text: "🎲 Next random", callback_data: "next:random" },
        { text: "🗂 Topics", callback_data: "menu:topics" },
      ],
      [
        { text: "📚 ICTSM", callback_data: "subj:ICTSM" },
        { text: "💼 Employability", callback_data: "subj:Employability" },
      ],
      [
        { text: "📈 Score", callback_data: "menu:score" },
        { text: "⚙️ Mode", callback_data: "menu:mode" },
      ],
    ],
  };
}

async function sendQuestion(
  chatId: number,
  subject: string | null,
  topic: string | null,
  mode: string,
) {
  const q = await pickQuestion(subject, topic);
  if (!q) {
    await tg("sendMessage", { chat_id: chatId, text: "No questions found." });
    return;
  }
  await setState(chatId, { mode, subject, topic, current_question_id: q.id });

  const correctIdx = LETTERS.indexOf(q.answer.toUpperCase() as (typeof LETTERS)[number]);
  const options = [q.option_a, q.option_b, q.option_c, q.option_d];

  if (mode === "poll") {
    // Telegram quiz polls require option text <= 100 chars and question <= 300 chars
    const safeQ = q.question.length > 290 ? q.question.slice(0, 287) + "..." : q.question;
    const safeOpts = options.map((o) => (o.length > 95 ? o.slice(0, 92) + "..." : o));
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
      reply_markup: {
        inline_keyboard: [
          LETTERS.map((L) => ({ text: L, callback_data: `ans:${q.id}:${L}` })),
        ],
      },
    });
  }
}

async function sendTopicsMenu(chatId: number, subject?: string) {
  let query = supabaseAdmin.from("questions").select("subject,topic");
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
  topics.sort((a, b) =>
    a.subject === b.subject ? a.topic.localeCompare(b.topic) : a.subject.localeCompare(b.subject),
  );
  const rows = topics.map((t) => [
    { text: `${t.subject === "ICTSM" ? "📚" : "💼"} ${t.topic}`, callback_data: `topic:${t.subject}:${t.topic}` },
  ]);
  await tg("sendMessage", {
    chat_id: chatId,
    text: subject ? `🗂 *${subject} topics* — pick one:` : "🗂 *Pick a topic:*",
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: rows },
  });
}

async function sendScore(chatId: number) {
  const { data } = await supabaseAdmin
    .from("user_scores")
    .select("total,correct")
    .eq("chat_id", chatId)
    .maybeSingle();
  const total = data?.total ?? 0;
  const correct = data?.correct ?? 0;
  const pct = total ? Math.round((correct / total) * 100) : 0;
  await tg("sendMessage", {
    chat_id: chatId,
    text: `📈 *Your score*\n\nCorrect: *${correct}* / ${total}\nAccuracy: *${pct}%*`,
    parse_mode: "Markdown",
    reply_markup: quickMenu(),
  });
}

async function sendModeMenu(chatId: number) {
  await tg("sendMessage", {
    chat_id: chatId,
    text: "Choose your quiz mode:",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "📊 Quiz Polls", callback_data: "mode:poll" },
          { text: "🔘 Inline Buttons", callback_data: "mode:button" },
        ],
      ],
    },
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
      await tg("sendMessage", {
        chat_id: chatId,
        text: welcomeText(),
        parse_mode: "Markdown",
        reply_markup: quickMenu(),
      });
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
    case "/score": {
      await sendScore(chatId);
      return;
    }
    case "/reset":
      await supabaseAdmin
        .from("user_scores")
        .upsert({ chat_id: chatId, username, total: 0, correct: 0, updated_at: new Date().toISOString() });
      await tg("sendMessage", { chat_id: chatId, text: "✅ Score reset." });
      return;
    default:
      await tg("sendMessage", {
        chat_id: chatId,
        text: "Unknown command. Send /help to see options.",
        reply_markup: quickMenu(),
      });
  }
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const TELEGRAM_API_KEY = process.env.TELEGRAM_API_KEY;
        if (!TELEGRAM_API_KEY) {
          return new Response("TELEGRAM_API_KEY missing", { status: 500 });
        }
        const expected = deriveSecret(TELEGRAM_API_KEY);
        const got = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!safeEqual(got, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const update = await request.json();

        try {
          const msg = update.message ?? update.edited_message;
          const cb = update.callback_query;

          // Resolve chat + username for gating
          const chatId: number | undefined =
            msg?.chat?.id ?? cb?.message?.chat?.id;
          const username: string | null =
            msg?.from?.username ??
            msg?.from?.first_name ??
            cb?.from?.username ??
            cb?.from?.first_name ??
            null;

          if (!chatId) return Response.json({ ok: true });

          // ---- Access gate ----
          const allowed = await isAllowed(chatId);
          if (!allowed) {
            // Only path in: /start <code>
            if (msg && typeof msg.text === "string") {
              const parts = msg.text.trim().split(/\s+/);
              if (parts[0].toLowerCase().startsWith("/start") && parts[1]) {
                const ok = await tryRedeemInvite(chatId, username, parts[1]);
                if (ok) {
                  await tg("sendMessage", {
                    chat_id: chatId,
                    text:
                      "🎉 Access granted!\n\n" + welcomeText(),
                    parse_mode: "Markdown",
                  });
                  return Response.json({ ok: true });
                }
              }
            }
            if (cb?.id) {
              await tg("answerCallbackQuery", {
                callback_query_id: cb.id,
                text: "Access required",
                show_alert: true,
              });
            }
            await tg("sendMessage", {
              chat_id: chatId,
              text:
                "🔒 *This bot is private.*\n\n" +
                "Open the invite link your friend shared to unlock it.",
              parse_mode: "Markdown",
            });
            return Response.json({ ok: true });
          }

          // ---- Allowed users ----
          if (msg && typeof msg.text === "string") {
            if (msg.text.startsWith("/")) {
              await handleCommand(chatId, username, msg.text);
            } else {
              await tg("sendMessage", {
                chat_id: chatId,
                text: "Send /help to see commands.",
              });
            }
          }

          if (cb?.data && cb.message?.chat?.id) {
            const data = cb.data as string;

            if (data.startsWith("mode:")) {
              const newMode = data.split(":")[1];
              await setState(chatId, { mode: newMode });
              await tg("answerCallbackQuery", { callback_query_id: cb.id, text: `Mode: ${newMode}` });
              await tg("sendMessage", {
                chat_id: chatId,
                text: `✅ Mode set to *${newMode === "poll" ? "Quiz Polls" : "Inline Buttons"}*. Try /random.`,
                parse_mode: "Markdown",
                reply_markup: quickMenu(),
              });
            } else if (data === "menu:topics") {
              await tg("answerCallbackQuery", { callback_query_id: cb.id });
              await sendTopicsMenu(chatId);
            } else if (data === "menu:score") {
              await tg("answerCallbackQuery", { callback_query_id: cb.id });
              await sendScore(chatId);
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
              const { data: q } = await supabaseAdmin
                .from("questions")
                .select("*")
                .eq("id", qid)
                .single();
              if (q) {
                const correct = letter.toUpperCase() === q.answer.toUpperCase();
                const opts = [q.option_a, q.option_b, q.option_c, q.option_d];
                const correctText = opts[LETTERS.indexOf(q.answer.toUpperCase() as (typeof LETTERS)[number])];
                const score = await bumpScore(chatId, username, correct);
                await tg("answerCallbackQuery", {
                  callback_query_id: cb.id,
                  text: correct ? "✅ Correct!" : "❌ Wrong",
                  show_alert: false,
                });
                await tg("sendMessage", {
                  chat_id: chatId,
                  text:
                    (correct ? "✅ *Correct!*" : `❌ *Wrong.* Answer: *${q.answer}* — ${correctText}`) +
                    `\n\nScore: ${score.correct}/${score.total}`,
                  parse_mode: "Markdown",
                  reply_markup: quickMenu(),
                });
                // Auto-send the next question in the same subject/topic context.
                const st = await getState(chatId);
                await sendQuestion(chatId, st?.subject ?? null, st?.topic ?? null, st?.mode ?? "button");
              } else {
                await tg("answerCallbackQuery", { callback_query_id: cb.id });
              }
            } else {
              await tg("answerCallbackQuery", { callback_query_id: cb.id });
            }
          }

          // Quiz poll answers (poll mode score tracking)
          const pa = update.poll_answer;
          if (pa) {
            // We don't know the correct answer from the poll_answer payload alone.
            // Track only that the user answered. For accurate correct/incorrect,
            // user can use button mode. Skip score increment in poll mode.
          }
        } catch (err) {
          console.error("webhook handler error", err);
        }

        return Response.json({ ok: true });
      },
    },
  },
});