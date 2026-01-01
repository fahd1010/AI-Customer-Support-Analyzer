import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const app = express();

app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(express.json({ limit: "2mb" }));
app.use(cors());

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;
const WEBHOOK_SECRET = process.env.KOMMO_WEBHOOK_SECRET || "change-me";

const DATA_DIR = path.resolve("data");
const WEBHOOK_LOG = path.join(DATA_DIR, "kommo_webhooks.ndjson");
const ERROR_LOG = path.join(DATA_DIR, "kommo_errors.ndjson");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

app.get("/health", (_req, res) => res.status(200).send("ok"));

app.post("/webhooks/kommo/:secret", (req, res) => {
  const requestId = crypto.randomUUID();
  const receivedAt = new Date().toISOString();

  // Fast auth check
  if (req.params.secret !== WEBHOOK_SECRET) {
    // log auth errors too (useful in debugging wrong URL/secret)
    logError({
      requestId,
      phase: "auth",
      err: new Error("Unauthorized webhook secret"),
      context: { receivedAt }
    });
    return res.status(401).send("unauthorized");
  }

  // IMPORTANT: ACK fast (Kommo expects <= 2s)
  res.status(200).send("ok");

  // Process async so we never miss SLA
  queueMicrotask(() => {
    try {
      const parsed = normalizePossiblyJsonWrapped(req.body);

      const events = extractKommoEvents(parsed);

      const entry = {
        id: requestId,
        receivedAt,
        headers: pickHeaders(req.headers),
        body: parsed,
        events
      };

      appendNdjson(WEBHOOK_LOG, entry);
    } catch (err) {
      logError({
        requestId,
        phase: "process",
        err,
        context: {
          receivedAt,
          headers: pickHeaders(req.headers),
          body: safeJson(req.body)
        }
      });
    }
  });
});

// Recent webhook logs
app.get("/api/webhooks/recent", (req, res) => {
  const limit = clampInt(req.query.limit, 50, 1, 200);
  res.status(200).json(readRecentNdjson(WEBHOOK_LOG, limit));
});

// Recent error logs
app.get("/api/errors/recent", (req, res) => {
  const limit = clampInt(req.query.limit, 50, 1, 200);
  res.status(200).json(readRecentNdjson(ERROR_LOG, limit));
});

// Optional: get one webhook by id (for correlation)
app.get("/api/webhooks/:id", (req, res) => {
  const id = req.params.id;
  const all = readRecentNdjson(WEBHOOK_LOG, 2000);
  const found = all.find(x => x?.id === id);
  if (!found) return res.status(404).json({ error: "not_found" });
  res.status(200).json(found);
});

app.listen(PORT, () => {
  console.log(`✅ Webhook receiver running on http://localhost:${PORT}`);
  console.log(`➡️ Kommo URL: /webhooks/kommo/${WEBHOOK_SECRET}`);
});

// ---------------- helpers ----------------

function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function pickHeaders(headers) {
  const allow = ["content-type", "user-agent", "x-forwarded-for", "x-real-ip"];
  const out = {};
  for (const k of allow) if (headers?.[k]) out[k] = headers[k];
  return out;
}

function appendNdjson(file, obj) {
  fs.appendFileSync(file, JSON.stringify(obj) + "\n", "utf8");
}

function readRecentNdjson(file, limit) {
  if (!fs.existsSync(file)) return [];
  const txt = fs.readFileSync(file, "utf8").trim();
  if (!txt) return [];
  const lines = txt.split("\n");
  return lines.slice(-limit).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

function safeJson(x) {
  try { return JSON.parse(JSON.stringify(x)); } catch { return String(x); }
}

function normalizePossiblyJsonWrapped(body) {
  if (!body || typeof body !== "object") return body;

  const keys = Object.keys(body);
  if (keys.length === 1) {
    const onlyKey = keys[0];
    const v = body[onlyKey];
    if (typeof v === "string") {
      const s = v.trim();
      if ((s.startsWith("{") && s.endsWith("}")) || (s.startsWith("[") && s.endsWith("]"))) {
        try { return JSON.parse(s); } catch { /* ignore */ }
      }
    }
  }
  return body;
}

function extractKommoEvents(payload) {
  const events = [];
  if (!payload || typeof payload !== "object") return events;

  for (const [entity, actions] of Object.entries(payload)) {
    if (!actions || typeof actions !== "object") continue;

    for (const [action, items] of Object.entries(actions)) {
      const arr = Array.isArray(items) ? items : (items ? [items] : []);
      for (const item of arr) {
        events.push({
          entity,
          action,
          id: item?.id ?? item?.talk_id ?? item?.chat_id ?? item?.entity_id ?? null,
          contact_id: item?.contact_id ?? null,
          entity_id: item?.entity_id ?? item?.element_id ?? null,
          text: item?.text ?? null,
          created_at: item?.created_at ?? null,
          data: item
        });
      }
    }
  }
  return events;
}

function logError({ requestId, phase, err, context }) {
  const message = err?.message ? String(err.message) : String(err);
  const stack = err?.stack ? String(err.stack) : null;
  const topFrame = parseTopFrame(stack);

  const entry = {
    id: crypto.randomUUID(),
    requestId,
    phase, // auth | process | persist | parse | ...
    at: new Date().toISOString(),
    message,
    topFrame, // { file, line, col }
    stack,
    context: context ?? null
  };

  try {
    appendNdjson(ERROR_LOG, entry);
  } catch (e) {
    // worst-case fallback: console
    console.error("❌ Failed to write error log:", e);
    console.error("Original error:", entry);
  }
}

function parseTopFrame(stack) {
  if (!stack) return null;
  const lines = stack.split("\n").slice(1);

  for (const line of lines) {
    // at fn (file:line:col)
    let m = line.match(/\((.*):(\d+):(\d+)\)\s*$/);
    if (m) return { file: m[1], line: Number(m[2]), col: Number(m[3]) };

    // at file:line:col
    m = line.match(/at\s+(.*):(\d+):(\d+)\s*$/);
    if (m) return { file: m[1], line: Number(m[2]), col: Number(m[3]) };
  }
  return null;
}
