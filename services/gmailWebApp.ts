// src/services/gmailWebApp.ts
// Gmail Web App client (Apps Script)
// - GET via JSONP (no CORS)
// - POST via no-cors (send + then verify by reloading thread)

export const GMAIL_WEBAPP_BASE =
  "https://script.google.com/macros/s/AKfycby60P_e5VEYvEws81WeJYnZLXNVNafh_LJMYx0xD3u3AvqYP2zF2-rYb6_BbBohJ3djXA/exec";

export const GMAIL_WEBAPP_KEY = "101099"; // لازم يطابق CONFIG.API_KEY في GAS

export type InboxItem = {
  threadId: string;
  messageId: string;
  dateISO: string;
  dateMs: number;

  subject: string;
  fromRaw: string;
  fromName: string;
  fromEmail: string;

  toRaw: string;
  ccRaw: string;
  bccRaw: string;

  bodyText: string;

  isFromMe: boolean;

  hasAttachments: boolean;
  attachments: Array<{
    index: number;
    name: string;
    contentType: string;
    isImage: boolean;
  }>;
};

export type InboxResponse = {
  ok: boolean;
  count: number;
  items: InboxItem[];
  query?: string;
  error?: string;
};

export type ThreadResponse = {
  ok: boolean;
  threadId: string;
  count: number;
  messages: InboxItem[];
  error?: string;
};

export type AttachmentResponse = {
  ok: boolean;
  threadId: string;
  messageId: string;
  attIndex: number;
  name: string;
  contentType: string;
  sizeBytes: number;
  isImage: boolean;
  base64: string;
  dataUrl: string | null;
  error?: string;
};

function withParams(base: string, params: Record<string, string | number | undefined | null>) {
  const url = new URL(base);
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    url.searchParams.set(k, String(v));
  });
  url.searchParams.set("_ts", String(Date.now()));
  return url.toString();
}

function jsonp<T>(url: string, timeoutMs = 15000): Promise<T> {
  return new Promise((resolve, reject) => {
    const cb = `__gd_jsonp_${Math.random().toString(16).slice(2)}_${Date.now()}`;
    const script = document.createElement("script");

    const cleanup = () => {
      try {
        delete (window as any)[cb];
      } catch {}
      script.remove();
    };

    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("JSONP timeout"));
    }, timeoutMs);

    (window as any)[cb] = (data: T) => {
      window.clearTimeout(timer);
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      window.clearTimeout(timer);
      cleanup();
      reject(new Error("JSONP load error"));
    };

    const u = new URL(url);
    u.searchParams.set("callback", cb);
    script.src = u.toString();
    document.body.appendChild(script);
  });
}

export async function getInbox(opts?: { sinceMs?: number; max?: number; label?: string }) {
  const url = withParams(GMAIL_WEBAPP_BASE, {
    route: "inbox",
    since: opts?.sinceMs ?? 0,
    max: opts?.max ?? 20,
    label: opts?.label ?? "",
  });
  return jsonp<InboxResponse>(url);
}

export async function getThread(threadId: string) {
  const url = withParams(GMAIL_WEBAPP_BASE, { route: "thread", threadId });
  return jsonp<ThreadResponse>(url);
}

export async function getAttachment(threadId: string, messageId: string, attIndex: number) {
  const url = withParams(GMAIL_WEBAPP_BASE, {
    route: "attachment",
    threadId,
    messageId,
    attIndex,
  });
  return jsonp<AttachmentResponse>(url);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const res = String(r.result || "");
      const comma = res.indexOf(",");
      resolve(comma >= 0 ? res.slice(comma + 1) : res);
    };
    r.onerror = () => reject(new Error("FileReader failed"));
    r.readAsDataURL(file);
  });
}

async function postNoCors(route: string, payload: any) {
  const url = withParams(GMAIL_WEBAPP_BASE, { route, key: GMAIL_WEBAPP_KEY });

  // no-cors => request goes out, response is opaque (we verify by reloading thread)
  await fetch(url, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ key: GMAIL_WEBAPP_KEY, ...payload }),
  });
  return { ok: true };
}

export async function replyThread(opts: { threadId: string; text: string; files?: File[] }) {
  const attachments =
    opts.files && opts.files.length
      ? await Promise.all(
          opts.files.map(async (f) => ({
            name: f.name,
            contentType: f.type || "application/octet-stream",
            base64: await fileToBase64(f),
          }))
        )
      : [];

  return postNoCors("reply", {
    threadId: opts.threadId,
    text: opts.text,
    attachments,
  });
}

export async function trashThread(threadId: string) {
  return postNoCors("trash", { threadId });
}
