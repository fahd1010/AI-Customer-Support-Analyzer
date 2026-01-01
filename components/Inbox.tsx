// src/components/InboxPage.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  getInbox,
  getThread,
  getAttachment,
  replyThread,
  trashThread,
  InboxItem,
} from "@/services/gmailWebApp";

const LS_SINCE_KEY = "gd_inbox_last_since_ms";

function fmtTime(ms: number) {
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return "";
  }
}

export default function InboxPage(props: {
  onInboundEmail?: (msg: InboxItem) => Promise<void> | void;
  onAgentReplySent?: (payload: { threadId: string; replyText: string }) => Promise<void> | void;
}) {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string>("");
  const [threadMsgs, setThreadMsgs] = useState<InboxItem[]>([]);
  const [loadingInbox, setLoadingInbox] = useState<boolean>(true);
  const [loadingThread, setLoadingThread] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const [draft, setDraft] = useState<string>("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);

  const [imgPreview, setImgPreview] = useState<Record<string, string>>({});

  const lastSinceRef = useRef<number>(0);
  const pollTimerRef = useRef<number | null>(null);

  const selectedThread = useMemo(() => {
    return items.find((x) => x.threadId === selectedThreadId) || null;
  }, [items, selectedThreadId]);

  function computeMaxDateMs(list: InboxItem[]) {
    return list.reduce((mx, it) => Math.max(mx, it.dateMs || 0), 0);
  }

  function mergeNew(prev: InboxItem[], incoming: InboxItem[]) {
    const map = new Map<string, InboxItem>();
    prev.forEach((m) => map.set(m.messageId, m));
    incoming.forEach((m) => map.set(m.messageId, m));
    const merged = Array.from(map.values());
    merged.sort((a, b) => (b.dateMs || 0) - (a.dateMs || 0));
    return merged;
  }

  async function loadInitialInbox() {
    setError("");
    setLoadingInbox(true);
    try {
      const res = await getInbox({ sinceMs: 0, max: 30 });
      if (!res.ok) throw new Error(res.error || "Inbox failed");
      setItems(res.items || []);

      const maxMs = computeMaxDateMs(res.items || []);
      lastSinceRef.current = maxMs;
      localStorage.setItem(LS_SINCE_KEY, String(maxMs));

      const first = (res.items || [])[0];
      if (first?.threadId) setSelectedThreadId(first.threadId);
    } catch (e: any) {
      setError(e?.message || "Failed to load inbox");
    } finally {
      setLoadingInbox(false);
    }
  }

  async function pollInbox() {
    try {
      const sinceMs = lastSinceRef.current || 0;
      const res = await getInbox({ sinceMs, max: 30 });
      if (!res.ok) return;

      const newOnes = (res.items || []).filter((x) => (x.dateMs || 0) > sinceMs);
      if (!newOnes.length) return;

      setItems((prev) => mergeNew(prev, newOnes));

      const maxMs = computeMaxDateMs(newOnes);
      if (maxMs > lastSinceRef.current) {
        lastSinceRef.current = maxMs;
        localStorage.setItem(LS_SINCE_KEY, String(maxMs));
      }

      // ingest ONLY inbound messages
      for (const msg of newOnes) {
        if (!msg.isFromMe) await props.onInboundEmail?.(msg);
      }
    } catch {
      // silent
    }
  }

  async function loadThread(threadId: string) {
    setError("");
    setLoadingThread(true);
    try {
      const res = await getThread(threadId);
      if (!res.ok) throw new Error(res.error || "Thread failed");
      setThreadMsgs(res.messages || []);
    } catch (e: any) {
      setError(e?.message || "Failed to load thread");
      setThreadMsgs([]);
    } finally {
      setLoadingThread(false);
    }
  }

  async function previewImage(threadId: string, messageId: string, attIndex: number) {
    const key = `${messageId}_${attIndex}`;
    if (imgPreview[key]) return;
    try {
      const res = await getAttachment(threadId, messageId, attIndex);
      if (res.ok && res.dataUrl) {
        setImgPreview((p) => ({ ...p, [key]: res.dataUrl! }));
      }
    } catch {}
  }

  async function onSend() {
    if (!selectedThreadId) return;
    const text = draft.trim();
    if (!text && files.length === 0) return;

    setSending(true);
    setError("");
    try {
      await replyThread({ threadId: selectedThreadId, text, files });

      setDraft("");
      setFiles([]);

      // Reload to verify the send + attachments
      await loadThread(selectedThreadId);
      await pollInbox();

      // update ticket + analyze reply
      await props.onAgentReplySent?.({ threadId: selectedThreadId, replyText: text });
    } catch (e: any) {
      setError(e?.message || "Send failed");
    } finally {
      setSending(false);
    }
  }

  async function onDeleteThread() {
    if (!selectedThreadId) return;
    try {
      await trashThread(selectedThreadId);
      setItems((prev) => prev.filter((x) => x.threadId !== selectedThreadId));
      setSelectedThreadId("");
      setThreadMsgs([]);
    } catch (e: any) {
      setError(e?.message || "Delete failed");
    }
  }

  function resetInbox() {
    localStorage.removeItem(LS_SINCE_KEY);
    lastSinceRef.current = 0;
    setItems([]);
    setSelectedThreadId("");
    setThreadMsgs([]);
    setImgPreview({});
    void loadInitialInbox();
  }

  useEffect(() => {
    const stored = Number(localStorage.getItem(LS_SINCE_KEY) || "0");
    lastSinceRef.current = Number.isFinite(stored) ? stored : 0;

    void loadInitialInbox();

    pollTimerRef.current = window.setInterval(() => {
      void pollInbox();
    }, 6000);

    return () => {
      if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedThreadId) return;
    void loadThread(selectedThreadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedThreadId]);

  return (
    <div className="h-[calc(100vh-110px)] w-full flex gap-4 font-sans">
      {/* Inbox list */}
      <div className="w-[380px] min-w-[340px] bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-lg font-semibold truncate">Inbox</div>
            <div className="text-xs text-gray-500">
              {loadingInbox ? "Loading…" : `${items.length} messages`}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={resetInbox}
              className="text-xs px-3 py-2 rounded-lg border hover:bg-gray-50"
              title="Reload"
            >
              Reload
            </button>
          </div>
        </div>

        {error ? (
          <div className="p-3 text-sm text-red-700 border-b bg-red-50 break-words">{error}</div>
        ) : null}

        <div className="flex-1 overflow-auto">
          {loadingInbox ? (
            <div className="p-4 text-sm text-gray-500">Loading inbox…</div>
          ) : items.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">No messages found.</div>
          ) : (
            <div className="divide-y">
              {items.map((it) => {
                const active = it.threadId === selectedThreadId;
                return (
                  <button
                    key={it.messageId}
                    onClick={() => setSelectedThreadId(it.threadId)}
                    className={
                      "w-full text-left p-3 hover:bg-gray-50 " + (active ? "bg-indigo-50" : "")
                    }
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">
                          {it.fromName || it.fromEmail || "Unknown Sender"}
                        </div>
                        <div className="text-xs text-gray-600 truncate">
                          {it.subject || "(no subject)"}
                        </div>
                      </div>
                      <div className="text-[11px] text-gray-500 whitespace-nowrap">
                        {fmtTime(it.dateMs)}
                      </div>
                    </div>

                    <div className="mt-2 text-xs text-gray-700 line-clamp-2 break-words" dir="auto">
                      {it.bodyText || ""}
                    </div>

                    <div className="mt-2 flex items-center gap-2">
                      {it.hasAttachments ? (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 border">
                          📎 {it.attachments.length}
                        </span>
                      ) : null}
                      {!it.isFromMe ? (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700">
                          Inbound
                        </span>
                      ) : (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">
                          Sent
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Thread */}
      <div className="flex-1 bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">
              {selectedThread?.subject || "Select a message"}
            </div>
            <div className="text-xs text-gray-500 truncate">
              {selectedThread ? `${fmtTime(selectedThread.dateMs)}` : ""}
            </div>
          </div>

          <button
            onClick={onDeleteThread}
            disabled={!selectedThreadId}
            className="text-xs px-3 py-2 rounded-lg border hover:bg-gray-50 disabled:opacity-50"
            title="Move to Trash"
          >
            Delete
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-3 bg-gray-50">
          {loadingThread ? (
            <div className="text-sm text-gray-500">Loading thread…</div>
          ) : !selectedThreadId ? (
            <div className="text-sm text-gray-500">Pick a message from the left.</div>
          ) : threadMsgs.length === 0 ? (
            <div className="text-sm text-gray-500">No messages in this thread.</div>
          ) : (
            threadMsgs.map((m) => {
              const mine = m.isFromMe;
              return (
                <div key={m.messageId} className={"flex " + (mine ? "justify-end" : "justify-start")}>
                  <div
                    className={
                      "max-w-[820px] rounded-2xl px-4 py-3 shadow-sm border " +
                      (mine ? "bg-white" : "bg-indigo-50")
                    }
                  >
                    <div className="text-[11px] text-gray-500 mb-1">
                      {mine ? "Agent" : (m.fromName || m.fromEmail || "Customer")} • {fmtTime(m.dateMs)}
                    </div>

                    <div className="text-sm text-gray-900 whitespace-pre-wrap break-words" dir="auto">
                      {m.bodyText || ""}
                    </div>

                    {m.hasAttachments && m.attachments?.length ? (
                      <div className="mt-3 space-y-2">
                        {m.attachments.map((a) => {
                          const k = `${m.messageId}_${a.index}`;
                          return (
                            <div key={k} className="text-xs">
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-1 rounded-lg border bg-white">
                                  📎 {a.name}
                                </span>

                                {a.isImage ? (
                                  <button
                                    className="px-2 py-1 rounded-lg border hover:bg-gray-100"
                                    onClick={() => previewImage(m.threadId, m.messageId, a.index)}
                                  >
                                    Preview
                                  </button>
                                ) : null}
                              </div>

                              {a.isImage && imgPreview[k] ? (
                                <img
                                  src={imgPreview[k]}
                                  alt={a.name}
                                  className="mt-2 max-h-[260px] rounded-xl border bg-white"
                                />
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Composer */}
        <div className="p-4 border-t bg-white">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Write your reply…"
                className="w-full min-h-[80px] max-h-[180px] resize-y rounded-xl border p-3 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
                disabled={!selectedThreadId || sending}
              />

              <div className="mt-2 flex items-center justify-between gap-3">
                <label className="text-xs px-3 py-2 rounded-xl border bg-gray-50 hover:bg-gray-100 cursor-pointer">
                  + Attach
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => setFiles(Array.from(e.target.files || []))}
                    disabled={!selectedThreadId || sending}
                  />
                </label>

                <div className="text-xs text-gray-500 truncate">
                  {files.length ? `${files.length} file(s) selected` : "No files"}
                </div>
              </div>
            </div>

            <button
              onClick={() => void onSend()}
              disabled={!selectedThreadId || sending || (!draft.trim() && files.length === 0)}
              className="px-5 py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-indigo-700"
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
