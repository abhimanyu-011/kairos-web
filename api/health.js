// GET /api/health - is the Kairos server online and is the model loaded?
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export async function GET() {
  const base = (process.env.KAIROS_API_URL || "").replace(/\/+$/, "");
  if (!base) return json({ online: false, ready: false, reason: "not_configured" });
  try {
    const r = await fetch(`${base}/health`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return json({ online: false, ready: false, reason: `status_${r.status}` });
    const h = await r.json();
    return json({ online: true, ready: !!h.model_loaded });
  } catch {
    return json({ online: false, ready: false, reason: "unreachable" });
  }
}
