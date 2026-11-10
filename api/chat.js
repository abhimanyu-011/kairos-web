// POST /api/chat - forwards the conversation to the Kairos server and streams the reply back.
// The secret key stays here on Vercel (environment variables), never in the browser.
//   KAIROS_API_URL  e.g. https://7860-xxxx.instabox.tech
//   KAIROS_API_KEY  the key saved in ~/.kairos.env on the server

const MAX_MESSAGES = 12;
const MAX_CHARS = 4000;

// Model selector modes -> generation settings (whitelisted; the browser can't send anything else)
const MODES = {
  balanced: { temperature: 0.7, max_tokens: 700 },
  precise: { temperature: 0.2, max_tokens: 700 },
  creative: { temperature: 1.0, max_tokens: 800 },
  quick: { temperature: 0.6, max_tokens: 250 },
};

const json = (data, status) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export async function POST(request) {
  const base = (process.env.KAIROS_API_URL || "").replace(/\/+$/, "");
  const key = process.env.KAIROS_API_KEY || "";
  if (!base || !key) return json({ error: "not_configured" }, 500);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const messages = (Array.isArray(body?.messages) ? body.messages : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== "user") return json({ error: "bad_request" }, 400);

  let upstream;
  try {
    upstream = await fetch(`${base}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ messages, ...(MODES[body.mode] || MODES.balanced) }),
    });
  } catch {
    return json({ error: "offline" }, 503);          // machine paused or unreachable
  }
  if (upstream.status === 503) return json({ error: "loading" }, 503);
  if (!upstream.ok || !upstream.body) return json({ error: "upstream", status: upstream.status }, 502);

  return new Response(upstream.body, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform" },
  });
}
