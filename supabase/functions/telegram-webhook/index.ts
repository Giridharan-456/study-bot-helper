import questions from "./questions.json" with { type: "json" };
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.4";

const LETTERS = ["A", "B", "C", "D"] as const;
type Letter = (typeof LETTERS)[number];
type Question = {
  subject: string;
  topic: string;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  answer: Letter;
};

const allQuestions = questions as Question[];
const topics = Array.from(
  new Map(allQuestions.map((q) => [`${q.subject}|${q.topic}`, { subject: q.subject, topic: q.topic }])).values(),
).sort((a, b) => (a.subject === b.subject ? a.topic.localeCompare(b.topic) : a.subject.localeCompare(b.subject)));

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

function botToken() {
  const value = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? Deno.env.get("TELEGRAM_API_KEY");
  if (!value) throw new Error("TELEGRAM_BOT_TOKEN missing");
  return value;
}

function db() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function tg(method: string, body: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${botToken()}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) console.error("Telegram API failed", method, data);
  return data;
}

function options(q: Question) {
  return [q.option_a, q.option_b, q.option_c, q.option_d];
}

function pickQuestion(subject?: string | null, topic?: string | null) {
  const pool = allQuestions.filter((q) => (!subject || q.subject === subject) && (!topic || q.topic === topic));
  if (!pool.length) return null;
  const question = pool[Math.floor(Math.random() * pool.length)];
  return { question, index: allQuestions.indexOf(question) };
}

function menu() {
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
        { text: "Reset", callback_data: "menu:reset" },
      ],
    ],
  };
}

async function getScore(chatId: number) {
  const client = db();
  if (!client) return { total: 0, correct: 0 };
  const { data } = await client
    .from("user_scores")
    .select("total,correct")
    .eq("chat_id", chatId)
    .maybeSingle();
  return { total: data?.total ?? 0, correct: data?.correct ?? 0 };
}

async function setScore(chatId: number, score: { total: number; correct: number }) {
  const client = db();
  if (!client) return;
  await client.from("user_scores").upsert({
    chat_id: chatId,
    total: score.total,
    correct: score.correct,
    updated_at: new Date().toISOString(),
  });
}

async function bumpScore(chatId: number, correct: boolean) {
  const score = await getScore(chatId);
  const next = { total: score.total + 1, correct: score.correct + (correct ? 1 : 0) };
  await setScore(chatId, next);
  return next;
}

async function sendQuestion(chatId: number, subject?: string | null, topic?: string | null) {
  const picked = pickQuestion(subject, topic);
  if (!picked) {
    await tg("sendMessage", { chat_id: chatId, text: "No questions found for this topic.", reply_markup: menu() });
    return;
  }

  const { question: q, index } = picked;
  const text =
    `[${q.subject} - ${q.topic}]\n\n${q.question}\n\n` +
    LETTERS.map((letter, i) => `${letter}. ${options(q)[i]}`).join("\n");

  await tg("sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: {
      inline_keyboard: [LETTERS.map((letter) => ({ text: letter, callback_data: `ans:${index}:${letter}` }))],
    },
  });
}

async function sendTopics(chatId: number, subject?: string) {
  const selected = topics.filter((t) => !subject || t.subject === subject);
  const rows = selected.map((topic) => {
    const index = topics.findIndex((t) => t.subject === topic.subject && t.topic === topic.topic);
    return [{ text: `${topic.subject}: ${topic.topic}`.slice(0, 60), callback_data: `topic:${index}` }];
  });
  await tg("sendMessage", {
    chat_id: chatId,
    text: subject ? `${subject} topics:` : "Choose a topic:",
    reply_markup: { inline_keyboard: rows.slice(0, 80) },
  });
}

async function sendScore(chatId: number) {
  const score = await getScore(chatId);
  const accuracy = score.total ? Math.round((score.correct / score.total) * 100) : 0;
  await tg("sendMessage", {
    chat_id: chatId,
    text: `Your score\n\nAnswered: ${score.total}\nAccuracy: ${accuracy}%`,
    reply_markup: menu(),
  });
}

async function resetScore(chatId: number) {
  await setScore(chatId, { total: 0, correct: 0 });
  await tg("sendMessage", { chat_id: chatId, text: "Score reset.", reply_markup: menu() });
}

async function handleText(chatId: number, text: string) {
  const cmd = text.trim().split(/\s+/)[0].toLowerCase().split("@")[0];
  switch (cmd) {
    case "/start":
    case "/help":
      await tg("sendMessage", {
        chat_id: chatId,
        text:
          "Welcome to Study Bot.\n\n" +
          "/ictsm - ICTSM question\n" +
          "/employability - Employability question\n" +
          "/random - mixed question\n" +
          "/topics - browse topics\n" +
          "/score - accuracy\n" +
          "/reset - reset score",
        reply_markup: menu(),
      });
      return;
    case "/ictsm":
      await sendQuestion(chatId, "ICTSM");
      return;
    case "/employability":
      await sendQuestion(chatId, "Employability");
      return;
    case "/random":
      await sendQuestion(chatId);
      return;
    case "/topics":
      await sendTopics(chatId);
      return;
    case "/score":
      await sendScore(chatId);
      return;
    case "/reset":
      await resetScore(chatId);
      return;
    default:
      await tg("sendMessage", { chat_id: chatId, text: "Send /help to see commands.", reply_markup: menu() });
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const expected = await deriveSecret(botToken());
  const got = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
  if (!safeEqual(got, expected)) return new Response("Unauthorized", { status: 401 });

  try {
    const update = await request.json();
    const msg = update.message ?? update.edited_message;
    const cb = update.callback_query;
    const chatId: number | undefined = msg?.chat?.id ?? cb?.message?.chat?.id;
    if (!chatId) return json({ ok: true });

    if (msg?.text) await handleText(chatId, msg.text);

    if (cb?.data) {
      const data = String(cb.data);
      await tg("answerCallbackQuery", { callback_query_id: cb.id });
      if (data === "next:random") await sendQuestion(chatId);
      else if (data === "menu:topics") await sendTopics(chatId);
      else if (data === "menu:score") await sendScore(chatId);
      else if (data === "menu:reset") await resetScore(chatId);
      else if (data === "subj:ICTSM") await sendTopics(chatId, "ICTSM");
      else if (data === "subj:Employability") await sendTopics(chatId, "Employability");
      else if (data.startsWith("topic:")) {
        const topic = topics[Number(data.slice("topic:".length))];
        if (topic) await sendQuestion(chatId, topic.subject, topic.topic);
      } else if (data.startsWith("ans:")) {
        const [, indexRaw, letterRaw] = data.split(":");
        const q = allQuestions[Number(indexRaw)];
        const letter = letterRaw as Letter;
        if (q && LETTERS.includes(letter)) {
          const correct = q.answer === letter;
          const score = await bumpScore(chatId, correct);
          const accuracy = score.total ? Math.round((score.correct / score.total) * 100) : 0;
          const answerText = options(q)[LETTERS.indexOf(q.answer)];
          await tg("sendMessage", {
            chat_id: chatId,
            text: correct
              ? `Correct. Accuracy: ${accuracy}%`
              : `Wrong. Answer: ${q.answer}. ${answerText}\nAccuracy: ${accuracy}%`,
            reply_markup: menu(),
          });
        }
      }
    }
  } catch (err) {
    console.error("webhook error", err);
  }

  return json({ ok: true });
});
