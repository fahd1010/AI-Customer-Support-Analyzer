// src/services/inboxService.ts
export type GasAttachmentMeta = {
  index: number;
  name: string;
  contentType: string;
  size?: number;
  isImage?: boolean;
};

export type GasInboxMessage = {
  threadId: string;
  messageId: string;
  dateISO: string;
  fromEmail: string;
  fromName?: string;
  toEmail?: string;
  subject?: string;
  snippet?: string;
  bodyText?: string;
  isFromMe: boolean;
  hasAttachments: boolean;
  attachments?: GasAttachmentMeta[];
};

export type GasInboxThread = {
  threadId: string;
  subject: string;
  snippet: string;
  messages: GasInboxMessage[];
};

const GAS_EXEC_URL =
  "https://script.google.com/macros/s/AKfycbxNFjHTJRaGtr3LzngnoKk6-7qzxtQIE5Fcn3bSZjOiON4XJri_hweMxbFiGm2k-c9eQg/exec";

function qs(params: Record<string, any>) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    sp.set(k, String(v));
  });
  return sp.toString();
}

async function getJson(url: string) {
  const res = await fetch(url);
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("Non-JSON response from Apps Script: " + text.slice(0, 200));
  }
  if (!json?.ok) throw new Error(json?.error || "Apps Script returned ok=false");
  return json;
}

async function postJson(url: string, payload: any) {
  // IMPORTANT: use text/plain to avoid CORS preflight issues on GAS
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("Non-JSON response from Apps Script: " + text.slice(0, 200));
  }
  if (!json?.ok) throw new Error(json?.error || "Apps Script returned ok=false");
  return json;
}

export async function fetchInboxThreads(opts?: { maxThreads?: number; maxMessagesPerThread?: number }) {
  const url =
    GAS_EXEC_URL +
    "?" +
    qs({
      route: "inbox",
      maxThreads: opts?.maxThreads ?? 25,
      maxMessages: opts?.maxMessagesPerThread ?? 25,
    });

  const json = await getJson(url);
  return (json.threads || []) as GasInboxThread[];
}

export async function fetchAttachmentDataUrl(messageId: string, index: number) {
  const url =
    GAS_EXEC_URL +
    "?" +
    qs({
      route: "attachment",
      messageId,
      index,
    });

  const json = await getJson(url);
  return String(json.dataUrl || "");
}

export async function replyToThread(payload: {
  threadId: string;
  messageId: string;
  bodyText: string;
  attachments?: Array<{ name: string; contentType: string; base64: string }>;
}) {
  const url = GAS_EXEC_URL + "?" + qs({ route: "reply" });
  const json = await postJson(url, payload);
  return json;
}
