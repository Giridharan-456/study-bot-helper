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

async function pickQuestion(subject: string | null) {
  let q = supabaseAdmin.from("questions").select("*");
  if (subject) q = q.eq("subject", subject);
  const { data: countRow } = await supabaseAdmin
    .from("questions")
    .select("id", { count: "exact", head: true })
    .then((r) => ({ data: r.count ?? 0 }));
  // Use random offset via raw query is overkill; fetch random by ordering by random() is heavy.
  // Simple approach: get all IDs (small dataset, ~640) and pick one.
  const idsRes = await (subject
    ? supabaseAdmin.from("questions").select("id").eq("subject", subject)
    : supabaseAdmin.from("questions").select("id"));
  const ids = (idsRes.data ?? []) as { id: number }[];
  if (!ids.length) return null;
  const pick = ids[Math.floor(Math.random() * ids.length)].id;
  const { data } = await supabaseAdmin.from("questions").select("*").eq("id", pick).single();
  void countRow;
  void q;
  return data;
}

async function sendQuestion(chatId: number, subject: string | null, mode: string) {
  const q = await pickQuestion(subject);
  if (!q) {
    await tg("sendMessage", { chat_id: chatId, text: "No questions found for that subject." });
    return;
  }
  await setState(chatId, { mode, subject, current_question_id: q.id });

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

function welcomeText() {
  return (
    "👋 *Welcome to Study Bot!*\n\n" +
    "Practice MCQs from your 2nd year syllabus.\n\n" +
    "*Commands:*\n" +
    "/ictsm — random ICTSM question\n" +
    "/employability — random Employability question\n" +
    "/random — random from any subject\n" +
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
      await tg("sendMessage", { chat_id: chatId, text: welcomeText(), parse_mode: "Markdown" });
      return;
    case "/mode":
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
      return;
    case "/ictsm":
      await sendQuestion(chatId, "ICTSM", mode);
      return;
    case "/employability":
      await sendQuestion(chatId, "Employability", mode);
      return;
    case "/random":
      await sendQuestion(chatId, null, mode);
      return;
    case "/score": {
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
      });
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
          // Plain message / command
          const msg = update.message ?? update.edited_message;
          if (msg?.chat?.id && typeof msg.text === "string") {
            const chatId = msg.chat.id as number;
            const username = msg.from?.username ?? msg.from?.first_name ?? null;
            if (msg.text.startsWith("/")) {
              await handleCommand(chatId, username, msg.text);
            } else {
              await tg("sendMessage", {
                chat_id: chatId,
                text: "Send /help to see commands.",
              });
            }
          }

          // Inline button clicks
          const cb = update.callback_query;
          if (cb?.data && cb.message?.chat?.id) {
            const chatId = cb.message.chat.id as number;
            const username = cb.from?.username ?? cb.from?.first_name ?? null;
            const data = cb.data as string;

            if (data.startsWith("mode:")) {
              const newMode = data.split(":")[1];
              await setState(chatId, { mode: newMode });
              await tg("answerCallbackQuery", { callback_query_id: cb.id, text: `Mode: ${newMode}` });
              await tg("sendMessage", {
                chat_id: chatId,
                text: `✅ Mode set to *${newMode === "poll" ? "Quiz Polls" : "Inline Buttons"}*. Try /random.`,
                parse_mode: "Markdown",
              });
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
                });
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