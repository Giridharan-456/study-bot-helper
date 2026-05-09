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
        data = JSON.parse(text);
      } catch {
        data = { ok: false, raw: text };
      }
      if (!res.ok) console.error(`tg ${method} failed`, res.status, data);
      if (res.ok || res.status < 500 || attempt === 3) return data;
    } catch (err) {
      lastErr = err;
      console.error(`tg ${method} threw`, err);
      if (attempt === 3) return { ok: false, error: String(err) };
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 250));
  }

  return { ok: false, error: String(lastErr) };
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
  await supabaseAdmin.from("bot_users").upsert({ chat_id: chatId, username, invite_code: code });
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

async function bumpScore(
  chatId: number,
  username: string | null,
  correct: boolean,
  questionId?: number,
) {
  const { data } = await supabaseAdmin
    .from("user_scores")
    .select("total,correct")
    .eq("chat_id", chatId)
    .maybeSingle();
  const total = (data?.total ?? 0) + 1;
  const ok = (data?.correct ?? 0) + (correct ? 1 : 0);
  await supabaseAdmin.from("user_scores").upsert({
    chat_id: chatId,
    username,
    total,
    correct: ok,
    updated_at: new Date().toISOString(),
  });

  if (!correct && questionId) {
    await trackWrongAnswer(chatId, questionId);
  }

  return { total, correct: ok };
}

async function trackWrongAnswer(chatId: number, questionId: number) {
  const { data } = await supabaseAdmin
    .from("wrong_answers")
    .select("wrong_count")
    .eq("chat_id", chatId)
    .eq("question_id", questionId)
    .maybeSingle();

  const count = (data?.wrong_count ?? 0) + 1;
  await supabaseAdmin.from("wrong_answers").upsert({
    chat_id: chatId,
    question_id: questionId,
    wrong_count: count,
    last_wrong_at: new Date().toISOString(),
  });
}

async function toggleBookmark(chatId: number, questionId: number) {
  const { data } = await supabaseAdmin
    .from("bookmarks")
    .select("*")
    .eq("chat_id", chatId)
    .eq("question_id", questionId)
    .maybeSingle();

  if (data) {
    await supabaseAdmin
      .from("bookmarks")
      .delete()
      .eq("chat_id", chatId)
      .eq("question_id", questionId);
    return false;
  } else {
    await supabaseAdmin.from("bookmarks").insert({ chat_id: chatId, question_id: questionId });
    return true;
  }
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

async function pickBookmarkedQuestion(chatId: number) {
  const { data: bms } = await supabaseAdmin
    .from("bookmarks")
    .select("question_id")
    .eq("chat_id", chatId);

  if (!bms || bms.length === 0) return null;
  const pick = bms[Math.floor(Math.random() * bms.length)].question_id;
  const { data } = await supabaseAdmin.from("questions").select("*").eq("id", pick).single();
  return data;
}

async function pickWrongQuestion(chatId: number) {
  const { data: wrs } = await supabaseAdmin
    .from("wrong_answers")
    .select("question_id")
    .eq("chat_id", chatId);

  if (!wrs || wrs.length === 0) return null;
  const pick = wrs[Math.floor(Math.random() * wrs.length)].question_id;
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
        { text: "⭐ Bookmarks", callback_data: "menu:bookmarks" },
        { text: "🔄 Review", callback_data: "menu:review" },
      ],
      [
        { text: "📈 Score", callback_data: "menu:score" },
        { text: "🏆 Top Students", callback_data: "menu:top" },
      ],
      [{ text: "⚙️ Mode", callback_data: "menu:mode" }],
    ],
  };
}

async function sendQuestion(
  chatId: number,
  subject: string | null,
  topic: string | null,
  mode: string,
  specialMode?: "bookmarks" | "review",
) {
  let q;
  if (specialMode === "bookmarks") {
    q = await pickBookmarkedQuestion(chatId);
    if (!q) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: "No bookmarked questions yet! Tap ⭐ on any question to bookmark it.",
      });
      return;
    }
  } else if (specialMode === "review") {
    q = await pickWrongQuestion(chatId);
    if (!q) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: "No wrong answers to review yet! Practice more to track your progress.",
      });
      return;
    }
  } else {
    q = await pickQuestion(subject, topic);
  }

  if (!q) {
    await tg("sendMessage", { chat_id: chatId, text: "No questions found." });
    return;
  }

  // Track special mode in user state if needed, or just regular context
  const stateSubject = specialMode ? `__${specialMode}__` : subject;
  await setState(chatId, { mode, subject: stateSubject, topic, current_question_id: q.id });

  const correctIdx = LETTERS.indexOf(q.answer.toUpperCase() as (typeof LETTERS)[number]);
  const options = [q.option_a, q.option_b, q.option_c, q.option_d];

  if (mode === "poll") {
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

    const { data: isBookmarked } = await supabaseAdmin
      .from("bookmarks")
      .select("*")
      .eq("chat_id", chatId)
      .eq("question_id", q.id)
      .maybeSingle();

    await tg("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          LETTERS.map((L) => ({ text: L, callback_data: `ans:${q.id}:${L}` })),
          [
            {
              text: isBookmarked ? "⭐ Bookmarked" : "☆ Bookmark",
              callback_data: `bookmark:${q.id}`,
            },
          ],
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
    {
      text: `${t.subject === "ICTSM" ? "📚" : "💼"} ${t.topic}`,
      callback_data: `topic:${t.subject}:${t.topic}`,
    },
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

async function sendLeaderboard(chatId: number) {
  const { data } = await supabaseAdmin
    .from("user_scores")
    .select("username,correct,total")
    .order("correct", { ascending: false })
    .limit(10);

  if (!data || data.length === 0) {
    await tg("sendMessage", { chat_id: chatId, text: "Leaderboard is empty." });
    return;
  }

  let text = "🏆 *Top Students*\n\n";
  data.forEach((u, i) => {
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
    const user = u.username || "Anonymous";
    text += `${medal} *${user}*: ${u.correct} correct (${u.total} total)\n`;
  });

  await tg("sendMessage", {
    chat_id: chatId,
    text,
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
    "/topics — browse all topics\n" +
    "/bookmarks — practice your starred questions\n" +
    "/review — practice questions you got wrong\n" +
    "/top — leaderboard\n" +
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
    case "/bookmarks":
      await sendQuestion(chatId, null, null, mode, "bookmarks");
      return;
    case "/review":
      await sendQuestion(chatId, null, null, mode, "review");
      return;
    case "/top":
      await sendLeaderboard(chatId);
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
      await supabaseAdmin.from("user_scores").upsert({
        chat_id: chatId,
        username,
        total: 0,
        correct: 0,
        updated_at: new Date().toISOString(),
      });
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
          const chatId: number | undefined = msg?.chat?.id ?? cb?.message?.chat?.id;
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
                    text: "🎉 Access granted!\n\n" + welcomeText(),
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
              await Promise.all([
                tg("answerCallbackQuery", { callback_query_id: cb.id, text: `Mode: ${newMode}` }),
                tg("sendMessage", {
                  chat_id: chatId,
                  text: `✅ Mode set to *${newMode === "poll" ? "Quiz Polls" : "Inline Buttons"}*. Try /random.`,
                  parse_mode: "Markdown",
                  reply_markup: quickMenu(),
                }),
              ]);
            } else if (data === "menu:topics") {
              await tg("answerCallbackQuery", { callback_query_id: cb.id });
              await sendTopicsMenu(chatId);
            } else if (data === "menu:score") {
              await tg("answerCallbackQuery", { callback_query_id: cb.id });
              await sendScore(chatId);
            } else if (data === "menu:mode") {
              await tg("answerCallbackQuery", { callback_query_id: cb.id });
              await sendModeMenu(chatId);
            } else if (data === "menu:top") {
              await tg("answerCallbackQuery", { callback_query_id: cb.id });
              await sendLeaderboard(chatId);
            } else if (data === "menu:bookmarks") {
              await tg("answerCallbackQuery", { callback_query_id: cb.id });
              const st = await getState(chatId);
              await sendQuestion(chatId, null, null, st?.mode ?? "poll", "bookmarks");
            } else if (data === "menu:review") {
              await tg("answerCallbackQuery", { callback_query_id: cb.id });
              const st = await getState(chatId);
              await sendQuestion(chatId, null, null, st?.mode ?? "poll", "review");
            } else if (data === "next:random") {
              await tg("answerCallbackQuery", { callback_query_id: cb.id });
              const st = await getState(chatId);
              await sendQuestion(chatId, null, null, st?.mode ?? "poll");
            } else if (data === "next:bookmarks") {
              await tg("answerCallbackQuery", { callback_query_id: cb.id });
              const st = await getState(chatId);
              await sendQuestion(chatId, null, null, st?.mode ?? "poll", "bookmarks");
            } else if (data === "next:review") {
              await tg("answerCallbackQuery", { callback_query_id: cb.id });
              const st = await getState(chatId);
              await sendQuestion(chatId, null, null, st?.mode ?? "poll", "review");
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
            } else if (data.startsWith("bookmark:")) {
              const qid = Number(data.split(":")[1]);
              const added = await toggleBookmark(chatId, qid);
              await tg("answerCallbackQuery", {
                callback_query_id: cb.id,
                text: added ? "⭐ Added to bookmarks" : "❌ Removed from bookmarks",
              });
              // Update the message to reflect bookmark status
              const { data: q } = await supabaseAdmin
                .from("questions")
                .select("*")
                .eq("id", qid)
                .single();
              if (q) {
                const options = [q.option_a, q.option_b, q.option_c, q.option_d];
                const text =
                  `📚 *${q.subject}* — _${q.topic}_\n\n` +
                  `${q.question}\n\n` +
                  LETTERS.map((L, i) => `*${L}.* ${options[i]}`).join("\n");

                await tg("editMessageText", {
                  chat_id: chatId,
                  message_id: cb.message.message_id,
                  text,
                  parse_mode: "Markdown",
                  reply_markup: {
                    inline_keyboard: [
                      LETTERS.map((L) => ({ text: L, callback_data: `ans:${q.id}:${L}` })),
                      [
                        {
                          text: added ? "⭐ Bookmarked" : "☆ Bookmark",
                          callback_data: `bookmark:${q.id}`,
                        },
                      ],
                    ],
                  },
                });
              }
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
                const correctText =
                  opts[LETTERS.indexOf(q.answer.toUpperCase() as (typeof LETTERS)[number])];
                const score = await bumpScore(chatId, username, correct, qid);
                await tg("answerCallbackQuery", {
                  callback_query_id: cb.id,
                  text: correct ? "✅ Correct!" : "❌ Wrong",
                  show_alert: false,
                });

                const st = await getState(chatId);
                let nextCallback = "next:random";
                let nextLabel = "🎲 Next random";

                if (st?.subject === "__bookmarks__") {
                  nextCallback = "next:bookmarks";
                  nextLabel = "🎲 Next bookmark";
                } else if (st?.subject === "__review__") {
                  nextCallback = "next:review";
                  nextLabel = "🎲 Next review";
                } else if (st?.topic) {
                  nextCallback = `topic:${st.subject}:${st.topic}`;
                  nextLabel = `🎲 Next in ${st.topic}`;
                } else if (st?.subject && !st.subject.startsWith("__")) {
                  nextCallback = `subj:${st.subject}`;
                  nextLabel = `🎲 Next in ${st.subject}`;
                }

                await tg("sendMessage", {
                  chat_id: chatId,
                  text:
                    (correct
                      ? "✅ *Correct!*"
                      : `❌ *Wrong.* Answer: *${q.answer}* — ${correctText}`) +
                    `\n\nScore: ${score.correct}/${score.total}`,
                  parse_mode: "Markdown",
                  reply_markup: {
                    inline_keyboard: [
                      [
                        { text: nextLabel, callback_data: nextCallback },
                        { text: "🏠 Menu", callback_data: "menu:main" },
                      ],
                    ],
                  },
                });
              } else {
                await tg("answerCallbackQuery", { callback_query_id: cb.id });
              }
            } else if (data === "menu:main") {
              await tg("answerCallbackQuery", { callback_query_id: cb.id });
              await tg("sendMessage", {
                chat_id: chatId,
                text: "Main Menu",
                reply_markup: quickMenu(),
              });
            } else {
              await tg("answerCallbackQuery", { callback_query_id: cb.id });
            }
          }

          // Quiz poll answers (poll mode score tracking)
          const pa = update.poll_answer;
          if (pa) {
            // In poll mode we don't easily know if it was correct here without more state.
          }
        } catch (err) {
          console.error("webhook handler error", err);
        }

        return Response.json({ ok: true });
      },
    },
  },
});
