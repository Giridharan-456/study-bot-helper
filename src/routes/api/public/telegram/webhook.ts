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

// ---- Visual formatting helpers (HTML parse_mode) ----
function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function subjectIcon(subject: string): string {
  return subject === "ICTSM" ? "📚" : subject === "Employability" ? "💼" : "🧠";
}

function formatQuestionCard(
  subject: string,
  topic: string,
  question: string,
  options: string[],
  header?: string,
): string {
  const head = header ? `<b>${esc(header)}</b>\n` : "";
  const tag = `${subjectIcon(subject)} <b>${esc(subject)}</b> · <i>${esc(topic)}</i>`;
  const divider = `━━━━━━━━━━━━━━━`;
  const opts = LETTERS.map(
    (L, i) => `   <b>${L}</b>  ·  ${esc(options[i] ?? "")}`,
  ).join("\n");
  return (
    `${head}${tag}\n${divider}\n\n` +
    `<b>❓ ${esc(question)}</b>\n\n` +
    `${opts}\n\n` +
    `<i>Tap a letter below to answer.</i>`
  );
}

function formatResult(
  correct: boolean,
  answer: string,
  correctText: string,
  picked: string,
  lifetime: { correct: number; total: number },
): string {
  const divider = `━━━━━━━━━━━━━━━`;
  const head = correct
    ? `✅ <b>Correct!</b>`
    : `❌ <b>Wrong</b> — you picked <b>${esc(picked)}</b>`;
  return (
    `\n\n${divider}\n${head}\n` +
    `🎯 Answer: <b>${esc(answer)}</b> · ${esc(correctText)}\n` +
    `📈 Lifetime: <b>${lifetime.correct}/${lifetime.total}</b>`
  );
}

// ---- Question ID cache (per subject|topic) ----
type IdCache = { ids: number[]; expires: number };
const idCache = new Map<string, IdCache>();
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getQuestionIds(subject: string | null, topic: string | null): Promise<number[]> {
  const key = `${subject ?? "*"}|${topic ?? "*"}`;
  const now = Date.now();
  const hit = idCache.get(key);
  if (hit && hit.expires > now) return hit.ids;
  let q = supabaseAdmin.from("questions").select("id");
  if (subject) q = q.eq("subject", subject);
  if (topic) q = q.eq("topic", topic);
  const { data } = await q;
  const ids = ((data ?? []) as { id: number }[]).map((r) => r.id);
  idCache.set(key, { ids, expires: now + CACHE_TTL_MS });
  return ids;
}

// ---- Topic list cache ----
type TopicRow = { subject: string; topic: string };
let topicCache: { rows: TopicRow[]; expires: number } | null = null;
async function getTopics(): Promise<TopicRow[]> {
  const now = Date.now();
  if (topicCache && topicCache.expires > now) return topicCache.rows;
  const { data } = await supabaseAdmin.from("questions").select("subject,topic");
  const seen = new Set<string>();
  const rows: TopicRow[] = [];
  for (const r of (data ?? []) as TopicRow[]) {
    const k = `${r.subject}|${r.topic}`;
    if (!seen.has(k)) {
      seen.add(k);
      rows.push(r);
    }
  }
  rows.sort((a, b) =>
    a.subject === b.subject ? a.topic.localeCompare(b.topic) : a.subject.localeCompare(b.subject),
  );
  topicCache = { rows, expires: now + CACHE_TTL_MS };
  return rows;
}

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
  const ids = await getQuestionIds(subject, topic);
  if (!ids.length) return null;
  const pick = ids[Math.floor(Math.random() * ids.length)];
  const { data } = await supabaseAdmin.from("questions").select("*").eq("id", pick).single();
  return data;
}

function persistentKeyboard() {
  return {
    keyboard: [
      // Browse
      [{ text: "🎲 /random" }, { text: "🗂 /topics" }],
      // Subjects
      [{ text: "📚 /ictsm" }, { text: "💼 /employability" }],
      // Modes
      [{ text: "🎯 /quiz" }, { text: "⚔️ /battle" }],
      // Practice
      [{ text: "🔁 /review" }, { text: "🔖 /bookmarks" }],
      // Stats
      [{ text: "📈 /score" }, { text: "🏆 /leaderboard" }],
      // Help
      [{ text: "❓ /help" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

const BOT_COMMANDS = [
  { command: "random", description: "🎲 Random question (any subject)" },
  { command: "ictsm", description: "📚 Random ICTSM question" },
  { command: "employability", description: "💼 Random Employability question" },
  { command: "topics", description: "🗂 Browse all 20 topics" },
  { command: "quiz", description: "🎯 10/20/50-question round" },
  { command: "battle", description: "⚔️ 1v1 quiz with a friend" },
  { command: "join", description: "🤝 Join a friend's battle" },
  { command: "review", description: "🔁 Re-do questions you got wrong" },
  { command: "bookmarks", description: "🔖 Practice your saved questions" },
  { command: "score", description: "📈 Your lifetime score" },
  { command: "leaderboard", description: "🏆 Top scorers" },
  { command: "reset", description: "♻️ Reset your score" },
  { command: "help", description: "❓ Show this menu" },
];

let commandsRegistered = false;
async function ensureCommandsRegistered() {
  if (commandsRegistered) return;
  commandsRegistered = true;
  try {
    await tg("setMyCommands", { commands: BOT_COMMANDS });
    await tg("setChatMenuButton", { menu_button: { type: "commands" } });
  } catch {
    commandsRegistered = false;
  }
}

async function sendQuestion(
  chatId: number,
  subject: string | null,
  topic: string | null,
  _mode?: string,
) {
  const q = await pickQuestion(subject, topic);
  if (!q) {
    await tg("sendMessage", { chat_id: chatId, text: "No questions found." });
    return;
  }
  await setState(chatId, { mode: "button", subject, topic, current_question_id: q.id });
  const options = [q.option_a, q.option_b, q.option_c, q.option_d];
  const bookmarked = await isBookmarked(chatId, q.id);
  await tg("sendMessage", {
    chat_id: chatId,
    text: formatQuestionCard(q.subject, q.topic, q.question, options),
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        LETTERS.map((L) => ({ text: L, callback_data: `ans:${q.id}:${L}` })),
        [{ text: bookmarked ? "🔖 Bookmarked" : "🔖 Bookmark", callback_data: `bm:${q.id}` }],
      ],
    },
  });
}

async function sendTopicsMenu(chatId: number, subject?: string) {
  const all = await getTopics();
  const topics = subject ? all.filter((t) => t.subject === subject) : all;
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
    parse_mode: "Markdown"
  });
}

async function sendLeaderboard(chatId: number) {
  const { data } = await supabaseAdmin
    .from("user_scores")
    .select("username,total,correct")
    .gte("total", 5)
    .order("correct", { ascending: false })
    .limit(10);
  const rows = (data ?? []) as { username: string | null; total: number; correct: number }[];
  if (!rows.length) {
    await tg("sendMessage", {
      chat_id: chatId,
      text: "🏆 *Leaderboard*\n\nNo scores yet — answer at least 5 questions to qualify!",
      parse_mode: "Markdown"
    });
    return;
  }
  const medals = ["🥇", "🥈", "🥉"];
  const lines = rows.map((r, i) => {
    const pct = r.total ? Math.round((r.correct / r.total) * 100) : 0;
    const tag = medals[i] ?? `${i + 1}.`;
    const name = (r.username ?? "anon").slice(0, 20);
    return `${tag} *${name}* — ${r.correct}/${r.total} (${pct}%)`;
  });
  await tg("sendMessage", {
    chat_id: chatId,
    text: `🏆 *Top scorers*\n\n${lines.join("\n")}`,
    parse_mode: "Markdown"
  });
}

async function sendQuizMenu(chatId: number) {
  await tg("sendMessage", {
    chat_id: chatId,
    text: "🎯 *Start a quiz round* — how many questions?",
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "10", callback_data: "quiz:10" },
          { text: "20", callback_data: "quiz:20" },
          { text: "50", callback_data: "quiz:50" },
        ],
      ],
    },
  });
}

async function startQuizSession(chatId: number, n: number, mode: string) {
  await setState(chatId, {
    subject: null,
    topic: null,
    session_total: n,
    session_correct: 0,
    session_remaining: n,
  });
  await tg("sendMessage", {
    chat_id: chatId,
    text: `🎯 Starting a *${n}-question* round. Good luck!`,
    parse_mode: "Markdown",
  });
  await sendQuestion(chatId, null, null, mode);
}

async function endQuizSession(chatId: number, total: number, correct: number) {
  const pct = total ? Math.round((correct / total) * 100) : 0;
  await setState(chatId, {
    session_total: null,
    session_correct: null,
    session_remaining: null,
  });
  await tg("sendMessage", {
    chat_id: chatId,
    text: `🏁 *Round complete!*\n\nScore: *${correct}/${total}* (${pct}%)`,
    parse_mode: "Markdown"
  });
}

// ============================================================
// Wrong-answer review + bookmarks
// ============================================================

async function addWrongAnswer(chatId: number, questionId: number) {
  await supabaseAdmin.from("wrong_answers").upsert(
    {
      chat_id: chatId,
      question_id: questionId,
      wrong_count: 1,
      last_wrong_at: new Date().toISOString(),
    },
    { onConflict: "chat_id,question_id", ignoreDuplicates: false },
  );
}

async function removeWrongAnswer(chatId: number, questionId: number) {
  await supabaseAdmin
    .from("wrong_answers")
    .delete()
    .eq("chat_id", chatId)
    .eq("question_id", questionId);
}

async function pickWrongAnswerQuestion(chatId: number) {
  const { data } = await supabaseAdmin
    .from("wrong_answers")
    .select("question_id")
    .eq("chat_id", chatId)
    .order("last_wrong_at", { ascending: true })
    .limit(50);
  const ids = (data ?? []).map((r) => r.question_id as number);
  if (!ids.length) return null;
  const qid = ids[Math.floor(Math.random() * ids.length)];
  const { data: q } = await supabaseAdmin
    .from("questions")
    .select("*")
    .eq("id", qid)
    .single();
  return q;
}

async function isBookmarked(chatId: number, questionId: number) {
  const { data } = await supabaseAdmin
    .from("bookmarks")
    .select("question_id")
    .eq("chat_id", chatId)
    .eq("question_id", questionId)
    .maybeSingle();
  return !!data;
}

async function toggleBookmark(chatId: number, questionId: number) {
  if (await isBookmarked(chatId, questionId)) {
    await supabaseAdmin
      .from("bookmarks")
      .delete()
      .eq("chat_id", chatId)
      .eq("question_id", questionId);
    return false;
  }
  await supabaseAdmin
    .from("bookmarks")
    .insert({ chat_id: chatId, question_id: questionId });
  return true;
}

async function pickBookmarkedQuestion(chatId: number) {
  const { data } = await supabaseAdmin
    .from("bookmarks")
    .select("question_id")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: false })
    .limit(200);
  const ids = (data ?? []).map((r) => r.question_id as number);
  if (!ids.length) return null;
  const qid = ids[Math.floor(Math.random() * ids.length)];
  const { data: q } = await supabaseAdmin
    .from("questions")
    .select("*")
    .eq("id", qid)
    .single();
  return q;
}

async function sendSpecificQuestion(
  chatId: number,
  q: {
    id: number;
    subject: string;
    topic: string;
    question: string;
    option_a: string;
    option_b: string;
    option_c: string;
    option_d: string;
    answer: string;
  },
  headerLabel?: string,
) {
  await setState(chatId, {
    mode: "button",
    subject: q.subject,
    topic: q.topic,
    current_question_id: q.id,
  });
  const options = [q.option_a, q.option_b, q.option_c, q.option_d];
  const bookmarked = await isBookmarked(chatId, q.id);
  await tg("sendMessage", {
    chat_id: chatId,
    text: formatQuestionCard(q.subject, q.topic, q.question, options, headerLabel),
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        LETTERS.map((L) => ({ text: L, callback_data: `ans:${q.id}:${L}` })),
        [{ text: bookmarked ? "🔖 Bookmarked" : "🔖 Bookmark", callback_data: `bm:${q.id}` }],
      ],
    },
  });
}

// ============================================================
// Battle mode (1v1)
// ============================================================

type Battle = {
  code: string;
  status: string;
  subject: string | null;
  topic: string | null;
  total_questions: number;
  round: number;
  p1_chat: number;
  p1_username: string | null;
  p2_chat: number | null;
  p2_username: string | null;
  p1_score: number;
  p2_score: number;
  current_question_id: number | null;
  p1_answer: string | null;
  p2_answer: string | null;
  p1_message_id: number | null;
  p2_message_id: number | null;
};

function genBattleCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 5; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

async function findBattle(code: string): Promise<Battle | null> {
  const { data } = await supabaseAdmin
    .from("battles")
    .select("*")
    .eq("code", code.toUpperCase())
    .maybeSingle();
  return (data as Battle | null) ?? null;
}

async function getActiveBattle(chatId: number): Promise<Battle | null> {
  const { data } = await supabaseAdmin
    .from("battles")
    .select("*")
    .neq("status", "done")
    .or(`p1_chat.eq.${chatId},p2_chat.eq.${chatId}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Battle | null) ?? null;
}

async function updateBattle(code: string, patch: Record<string, unknown>) {
  await supabaseAdmin
    .from("battles")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("code", code);
}

async function sendBattleTopicMenu(chatId: number) {
  const all = await getTopics();
  const rows: { text: string; callback_data: string }[][] = [
    [{ text: "🎲 Any subject", callback_data: "bt-topic:*:*" }],
    [{ text: "📚 Any ICTSM", callback_data: "bt-topic:ICTSM:*" }],
    [{ text: "💼 Any Employability", callback_data: "bt-topic:Employability:*" }],
  ];
  for (const t of all) {
    rows.push([
      {
        text: `${t.subject === "ICTSM" ? "📚" : "💼"} ${t.topic}`,
        callback_data: `bt-topic:${t.subject}:${t.topic}`,
      },
    ]);
  }
  await tg("sendMessage", {
    chat_id: chatId,
    text: "⚔️ *Battle mode* — pick a topic for the 1v1:",
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: rows },
  });
}

async function createBattle(
  chatId: number,
  username: string | null,
  subject: string | null,
  topic: string | null,
) {
  // close any pending battle this user hosts
  await supabaseAdmin
    .from("battles")
    .update({ status: "done", updated_at: new Date().toISOString() })
    .eq("p1_chat", chatId)
    .eq("status", "waiting");

  let code = "";
  for (let i = 0; i < 5; i++) {
    code = genBattleCode();
    const exists = await findBattle(code);
    if (!exists) break;
  }

  await supabaseAdmin.from("battles").insert({
    code,
    status: "waiting",
    subject,
    topic,
    p1_chat: chatId,
    p1_username: username,
    total_questions: 10,
  });

  const label = topic ?? (subject ? `Any ${subject}` : "Any subject");
  await tg("sendMessage", {
    chat_id: chatId,
    text:
      `⚔️ *Battle created!*\n\n` +
      `Topic: *${label}*\nRounds: *10*\n\n` +
      `Share this code with your opponent:\n\`${code}\`\n\n` +
      `They join by tapping the link below or sending \`/join ${code}\`.`,
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "🔗 Share invite",
            url: `https://t.me/share/url?url=${encodeURIComponent(
              `https://t.me/Studyictsm_bot?start=bt_${code}`,
            )}&text=${encodeURIComponent(`⚔️ Quiz battle (${label}) — join me on Study Bot!`)}`,
          },
        ],
        [{ text: "✖️ Cancel", callback_data: `bt-cancel:${code}` }],
      ],
    },
  });
}

async function joinBattle(chatId: number, username: string | null, rawCode: string) {
  const code = rawCode.trim().toUpperCase();
  const b = await findBattle(code);
  if (!b) {
    await tg("sendMessage", { chat_id: chatId, text: "❌ Battle code not found." });
    return;
  }
  if (b.status !== "waiting") {
    await tg("sendMessage", { chat_id: chatId, text: "⚠️ That battle is no longer open." });
    return;
  }
  if (b.p1_chat === chatId) {
    await tg("sendMessage", { chat_id: chatId, text: "🙃 You can't join your own battle." });
    return;
  }
  await updateBattle(code, {
    p2_chat: chatId,
    p2_username: username,
    status: "active",
    round: 0,
    p1_score: 0,
    p2_score: 0,
  });
  const label = b.topic ?? (b.subject ? `Any ${b.subject}` : "Any subject");
  const intro = `⚔️ *Battle starting!*\nTopic: *${label}*\nRounds: *${b.total_questions}*\n\nP1: ${b.p1_username ?? "Player 1"}\nP2: ${username ?? "Player 2"}`;
  await tg("sendMessage", { chat_id: b.p1_chat, text: intro, parse_mode: "Markdown" });
  await tg("sendMessage", { chat_id: chatId, text: intro, parse_mode: "Markdown" });
  const fresh = await findBattle(code);
  if (fresh) await sendBattleRound(fresh);
}

async function sendBattleRound(b: Battle) {
  const q = await pickQuestion(b.subject, b.topic);
  if (!q || !b.p2_chat) return;
  const opts = [q.option_a, q.option_b, q.option_c, q.option_d];
  const header = `⚔️ Round ${b.round + 1}/${b.total_questions}  ·  ${b.p1_score} – ${b.p2_score}`;
  const text = formatQuestionCard(q.subject, q.topic, q.question, opts, header);
  const reply_markup = {
    inline_keyboard: [
      LETTERS.map((L) => ({ text: L, callback_data: `bt-ans:${b.code}:${b.round}:${L}` })),
    ],
  };
  const m1 = await tg("sendMessage", {
    chat_id: b.p1_chat,
    text,
    parse_mode: "HTML",
    reply_markup,
  });
  const m2 = await tg("sendMessage", {
    chat_id: b.p2_chat,
    text,
    parse_mode: "HTML",
    reply_markup,
  });
  await updateBattle(b.code, {
    current_question_id: q.id,
    p1_answer: null,
    p2_answer: null,
    p1_message_id: m1?.result?.message_id ?? null,
    p2_message_id: m2?.result?.message_id ?? null,
  });
}

async function handleBattleAnswer(
  chatId: number,
  cbId: string,
  code: string,
  roundStr: string,
  letter: string,
) {
  const b = await findBattle(code);
  if (!b || b.status !== "active") {
    await tg("answerCallbackQuery", { callback_query_id: cbId, text: "Battle ended" });
    return;
  }
  const round = Number(roundStr);
  if (round !== b.round) {
    await tg("answerCallbackQuery", { callback_query_id: cbId, text: "Round already over" });
    return;
  }
  const isP1 = chatId === b.p1_chat;
  const isP2 = chatId === b.p2_chat;
  if (!isP1 && !isP2) {
    await tg("answerCallbackQuery", { callback_query_id: cbId, text: "Not in this battle" });
    return;
  }
  const already = isP1 ? b.p1_answer : b.p2_answer;
  if (already) {
    await tg("answerCallbackQuery", { callback_query_id: cbId, text: "Already answered" });
    return;
  }
  await tg("answerCallbackQuery", { callback_query_id: cbId, text: `Locked in: ${letter}` });
  const patch: Record<string, unknown> = isP1
    ? { p1_answer: letter }
    : { p2_answer: letter };
  await updateBattle(code, patch);

  // Edit player's own message — remove buttons, show waiting state in place
  const myMsg = isP1 ? b.p1_message_id : b.p2_message_id;
  if (myMsg) {
    await tg("editMessageReplyMarkup", {
      chat_id: chatId,
      message_id: myMsg,
      reply_markup: { inline_keyboard: [] },
    });
  }

  // Reload and check if both answered
  const fresh = await findBattle(code);
  if (!fresh) return;
  if (fresh.p1_answer && fresh.p2_answer) {
    await revealBattleRound(fresh);
  }
}

async function revealBattleRound(b: Battle) {
  if (!b.current_question_id || !b.p2_chat) return;
  const { data: q } = await supabaseAdmin
    .from("questions")
    .select("*")
    .eq("id", b.current_question_id)
    .single();
  if (!q) return;
  const opts = [q.option_a, q.option_b, q.option_c, q.option_d];
  const correctL = (q.answer as string).toUpperCase();
  const correctText = opts[LETTERS.indexOf(correctL as (typeof LETTERS)[number])];
  const p1ok = b.p1_answer?.toUpperCase() === correctL;
  const p2ok = b.p2_answer?.toUpperCase() === correctL;
  const newP1 = b.p1_score + (p1ok ? 1 : 0);
  const newP2 = b.p2_score + (p2ok ? 1 : 0);
  const p1Name = b.p1_username ?? "P1";
  const p2Name = b.p2_username ?? "P2";
  const divider = `━━━━━━━━━━━━━━━`;
  const summary =
    `🔓 <b>Round ${b.round + 1} reveal</b>\n${divider}\n\n` +
    `🎯 Correct: <b>${correctL}</b> · ${esc(correctText ?? "")}\n\n` +
    `${p1ok ? "✅" : "❌"} <b>${esc(p1Name)}</b> picked <b>${esc(b.p1_answer ?? "—")}</b>\n` +
    `${p2ok ? "✅" : "❌"} <b>${esc(p2Name)}</b> picked <b>${esc(b.p2_answer ?? "—")}</b>\n\n` +
    `📊 <b>Score:</b> ${newP1} — ${newP2}`;
  await tg("sendMessage", { chat_id: b.p1_chat, text: summary, parse_mode: "HTML" });
  await tg("sendMessage", { chat_id: b.p2_chat, text: summary, parse_mode: "HTML" });

  const nextRound = b.round + 1;
  if (nextRound >= b.total_questions) {
    await updateBattle(b.code, {
      status: "done",
      p1_score: newP1,
      p2_score: newP2,
      round: nextRound,
    });
    let outcome: string;
    if (newP1 === newP2) outcome = "🤝 *It's a draw!*";
    else if (newP1 > newP2) outcome = `🏆 *${p1Name} wins!*`;
    else outcome = `🏆 *${p2Name} wins!*`;
    const finale = `🏁 *Battle over*\n\nFinal: ${p1Name} ${newP1} — ${newP2} ${p2Name}\n\n${outcome}`;
    await tg("sendMessage", {
      chat_id: b.p1_chat,
      text: finale,
      parse_mode: "Markdown"
    });
    await tg("sendMessage", {
      chat_id: b.p2_chat,
      text: finale,
      parse_mode: "Markdown"
    });
    return;
  }

  await updateBattle(b.code, {
    p1_score: newP1,
    p2_score: newP2,
    round: nextRound,
    p1_answer: null,
    p2_answer: null,
  });
  const next = await findBattle(b.code);
  if (next) await sendBattleRound(next);
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
    "/quiz — start a 10/20/50-question round\n" +
    "/battle — challenge a friend (1v1)\n" +
    "/join CODE — join a friend's battle\n" +
    "/review — re-do questions you got wrong\n" +
    "/bookmarks — practice your saved questions\n" +
    "/leaderboard — top scorers\n" +
    "/score — your score\n" +
    "/reset — reset your score\n"
  );
}

async function handleCommand(chatId: number, username: string | null, text: string) {
  // Accept buttons like "🎲 /random" — find the first slash-command token.
  const match = text.match(/\/[A-Za-z]+/);
  const cmd = (match ? match[0] : text.split(/\s+/)[0]).toLowerCase().split("@")[0];
  const state = await getState(chatId);
  const mode = state?.mode ?? "poll";

  switch (cmd) {
    case "/start":
    case "/help":
      await tg("sendMessage", {
        chat_id: chatId,
        text: welcomeText(),
        parse_mode: "Markdown",
        reply_markup: persistentKeyboard(),
      });
      return;
    case "/topics":
      await sendTopicsMenu(chatId);
      return;
    case "/quiz":
      await sendQuizMenu(chatId);
      return;
    case "/battle":
      await sendBattleTopicMenu(chatId);
      return;
    case "/review": {
      const q = await pickWrongAnswerQuestion(chatId);
      if (!q) {
        await tg("sendMessage", {
          chat_id: chatId,
          text:
            "🎉 Nothing to review! You haven't gotten any questions wrong yet.\n\n" +
            "Try /random or /quiz to practice more.",
        });
        return;
      }
      await sendSpecificQuestion(chatId, q, "🔁 Review · question you got wrong");
      return;
    }
    case "/bookmarks": {
      const q = await pickBookmarkedQuestion(chatId);
      if (!q) {
        await tg("sendMessage", {
          chat_id: chatId,
          text:
            "🔖 No bookmarks yet.\n\n" +
            "Tap <b>🔖 Bookmark</b> below any question to save it for later.",
          parse_mode: "HTML",
        });
        return;
      }
      await sendSpecificQuestion(chatId, q, "🔖 From your bookmarks");
      return;
    }
    case "/join": {
      const code = text.match(/\/join\s+(\S+)/i)?.[1];
      if (!code) {
        await tg("sendMessage", {
          chat_id: chatId,
          text: "Usage: `/join CODE`",
          parse_mode: "Markdown",
        });
        return;
      }
      await joinBattle(chatId, username, code);
      return;
    }
    case "/leaderboard":
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
      await supabaseAdmin
        .from("user_scores")
        .upsert({ chat_id: chatId, username, total: 0, correct: 0, updated_at: new Date().toISOString() });
      await tg("sendMessage", { chat_id: chatId, text: "✅ Score reset." });
      return;
    default:
      await tg("sendMessage", {
        chat_id: chatId,
        text: "Unknown command. Send /help to see options."
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
        void ensureCommandsRegistered();

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
                    reply_markup: persistentKeyboard(),
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
            // Deep-link battle join: /start bt_<code>
            const parts = msg.text.trim().split(/\s+/);
            if (
              parts[0].toLowerCase().startsWith("/start") &&
              parts[1] &&
              parts[1].toLowerCase().startsWith("bt_")
            ) {
              await joinBattle(chatId, username, parts[1].slice(3));
            } else if (/\/[A-Za-z]+/.test(msg.text)) {
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

            if (data === "menu:topics") {
              await tg("answerCallbackQuery", { callback_query_id: cb.id });
              await sendTopicsMenu(chatId);
            } else if (data === "menu:score") {
              await tg("answerCallbackQuery", { callback_query_id: cb.id });
              await sendScore(chatId);
            } else if (data === "menu:leaderboard") {
              await tg("answerCallbackQuery", { callback_query_id: cb.id });
              await sendLeaderboard(chatId);
            } else if (data.startsWith("bm:")) {
              const qid = Number(data.slice(3));
              const nowOn = await toggleBookmark(chatId, qid);
              await tg("answerCallbackQuery", {
                callback_query_id: cb.id,
                text: nowOn ? "🔖 Bookmarked" : "Bookmark removed",
              });
              // Update only the bookmark button label
              if (cb.message?.message_id && cb.message?.reply_markup) {
                const kb = (cb.message.reply_markup as { inline_keyboard?: unknown[][] }).inline_keyboard ?? [];
                const newKb = kb.map((row) =>
                  (row as Array<{ text: string; callback_data: string }>).map((btn) =>
                    btn.callback_data === data
                      ? { ...btn, text: nowOn ? "🔖 Bookmarked" : "🔖 Bookmark" }
                      : btn,
                  ),
                );
                await tg("editMessageReplyMarkup", {
                  chat_id: chatId,
                  message_id: cb.message.message_id,
                  reply_markup: { inline_keyboard: newKb },
                });
              }
            } else if (data.startsWith("quiz:")) {
              const n = Number(data.split(":")[1]);
              await tg("answerCallbackQuery", { callback_query_id: cb.id });
              const st = await getState(chatId);
              await startQuizSession(chatId, n, st?.mode ?? "button");
            } else if (data.startsWith("bt-topic:")) {
              const rest = data.slice("bt-topic:".length);
              const sep = rest.indexOf(":");
              const subj = rest.slice(0, sep);
              const topic = rest.slice(sep + 1);
              await tg("answerCallbackQuery", { callback_query_id: cb.id });
              await createBattle(
                chatId,
                username,
                subj === "*" ? null : subj,
                topic === "*" ? null : topic,
              );
            } else if (data.startsWith("bt-cancel:")) {
              const code = data.slice("bt-cancel:".length);
              const b = await findBattle(code);
              if (b && b.p1_chat === chatId && b.status === "waiting") {
                await updateBattle(code, { status: "done" });
                await tg("answerCallbackQuery", { callback_query_id: cb.id, text: "Cancelled" });
                await tg("sendMessage", { chat_id: chatId, text: "✖️ Battle cancelled." });
              } else {
                await tg("answerCallbackQuery", { callback_query_id: cb.id });
              }
            } else if (data.startsWith("bt-ans:")) {
              const [, code, roundStr, letter] = data.split(":");
              await handleBattleAnswer(chatId, cb.id, code, roundStr, letter);
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
                if (correct) {
                  await removeWrongAnswer(chatId, qid);
                } else {
                  await addWrongAnswer(chatId, qid);
                }
                await tg("answerCallbackQuery", {
                  callback_query_id: cb.id,
                  text: correct ? "✅ Correct!" : "❌ Wrong",
                  show_alert: false,
                });
                // Edit the question message in place: append result, remove buttons.
                if (cb.message?.message_id) {
                  const rebuilt = formatQuestionCard(
                    q.subject,
                    q.topic,
                    q.question,
                    [q.option_a, q.option_b, q.option_c, q.option_d],
                  );
                  const resultLine = formatResult(
                    correct,
                    q.answer,
                    correctText,
                    letter,
                    { correct: score.correct, total: score.total },
                  );
                  await tg("editMessageText", {
                    chat_id: chatId,
                    message_id: cb.message.message_id,
                    text: rebuilt + resultLine,
                    parse_mode: "HTML",
                  });
                }
                // Quiz session bookkeeping
                const st = await getState(chatId);
                const inSession =
                  st?.session_remaining != null && st.session_remaining > 0;
                if (inSession) {
                  const remaining = (st!.session_remaining as number) - 1;
                  const sessCorrect =
                    (st!.session_correct as number) + (correct ? 1 : 0);
                  await setState(chatId, {
                    session_remaining: remaining,
                    session_correct: sessCorrect,
                  });
                  if (remaining <= 0) {
                    await endQuizSession(
                      chatId,
                      st!.session_total as number,
                      sessCorrect,
                    );
                    return;
                  }
                  // In an active quiz session, auto-advance to next question.
                  await sendQuestion(
                    chatId,
                    st?.subject ?? null,
                    st?.topic ?? null,
                    st?.mode ?? "button",
                  );
                  return;
                }
                // Outside a quiz session: stop here. User can tap the menu
                // (/random, /topics, etc.) to request the next question.
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