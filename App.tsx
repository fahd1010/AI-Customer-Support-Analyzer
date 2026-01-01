// src/App.tsx - WITH PIPELINE & ADD DETAILS
import React, { useEffect, useState, useCallback, useMemo } from "react";
import Layout from "./components/Layout.tsx";
import Dashboard from "./components/Dashboard.tsx";
import AddIssue from "./components/AddIssue.tsx";
import IssueList from "./components/IssueList.tsx";
import CustomerInsights from "./components/CustomerInsights.tsx";
import AgentInsights from "./components/AgentInsights.tsx";
import ProductInsights from "./components/ProductInsights.tsx";
import LoginPage from "./components/LoginPage.tsx";
import ErrorBoundary from "./components/ErrorBoundary.tsx";
import Toast from "./components/Toast.tsx";

import {
  SupportTicket,
  TicketMessageInput,
  normalizeEmail,
  buildCustomerKey,
  migrateLegacyIssuesToTickets,
  STORAGE_KEYS,
} from "./types.ts";

import { analyzeCustomerMessage, analyzeAgentReply } from "./services/geminiService.ts";
import {
  loadTicketsSharedFirst,
  saveTicketsSmart,
  remoteMode,
  saveLocalTickets,
  saveRemoteTickets,
} from "./services/storageService.ts";

import { 
  saveInboxMessage, 
  saveInboxAttachment, 
  uploadAttachmentToStorage, 
  getInboxMessages, 
  getThreadMessages,
  getAttachmentsByMessageId,
  updateThreadDetails,
  getThreadDetails,
  addThreadNote,
  getThreadNotes,
  addThreadAction
} from "./services/supabaseInboxService.ts";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const DEFAULT_GMAIL_WEBAPP_URL =
  "https://script.google.com/macros/s/AKfycbxNFjHTJRaGtr3LzngnoKk6-7qzxtQIE5Fcn3bSZjOiON4XJri_hweMxbFiGm2k-c9eQg/exec";

const GMAIL_API_KEY = "101099";
const INBOX_POLL_MS = 10000;

const LS_WEBAPP_URL = "gd_gmail_webapp_url";
const LS_LAST_SEEN_MS = "gd_inbox_last_seen_ms";
const LS_SEEN_MESSAGE_IDS = "gd_inbox_seen_message_ids";
const LS_HIDDEN_THREADS = "gd_inbox_hidden_threads";
const LS_INBOX_ITEMS = "gd_inbox_items";

type ToastType = "success" | "error" | "info" | "warning";

interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
}

type InboxAttachmentMeta = {
  index: number;
  name: string;
  contentType: string;
  isImage: boolean;
};

type InboxItem = {
  threadId: string;
  messageId: string;
  dateISO: string;
  dateMs: number;
  subject: string;
  fromRaw: string;
  fromName: string;
  fromEmail: string;
  toRaw?: string;
  ccRaw?: string;
  bccRaw?: string;
  isFromMe: boolean;
  bodyText: string;
  hasAttachments: boolean;
  attachments: InboxAttachmentMeta[];
  customerKey?: string;
  pipelineStage?: string;
  priority?: string;
};

type ThreadResponse = {
  ok: boolean;
  threadId: string;
  count: number;
  messages: InboxItem[];
};

const PIPELINE_STAGES = [
  { value: 'New Lead', label: '🟦 New Lead', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  { value: 'Contacted', label: '🟡 Contacted', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  { value: 'Qualified', label: '🟠 Qualified', color: 'bg-orange-100 text-orange-800 border-orange-300' },
  { value: 'Proposal Sent', label: '🟣 Proposal Sent', color: 'bg-purple-100 text-purple-800 border-purple-300' },
  { value: 'Negotiation', label: '🔵 Negotiation', color: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
  { value: 'Won', label: '🟢 Won', color: 'bg-green-100 text-green-800 border-green-300' },
  { value: 'Lost', label: '🔴 Lost', color: 'bg-red-100 text-red-800 border-red-300' },
];

function jsonp<T = any>(url: string, timeoutMs = 15000): Promise<T> {
  return new Promise((resolve, reject) => {
    const cbName = `__gd_jsonp_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    const cleanup = () => {
      try {
        delete (window as any)[cbName];
      } catch {}
      if (script.parentNode) script.parentNode.removeChild(script);
      window.clearTimeout(timer);
    };

    (window as any)[cbName] = (data: T) => {
      cleanup();
      resolve(data);
    };

    const script = document.createElement("script");
    const sep = url.includes("?") ? "&" : "?";
    script.src = `${url}${sep}callback=${encodeURIComponent(cbName)}`;
    script.async = true;

    script.onerror = () => {
      cleanup();
      reject(new Error("JSONP load failed"));
    };

    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("JSONP timeout"));
    }, timeoutMs);

    document.body.appendChild(script);
  });
}

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function uniqPushLimited(arr: string[], v: string, limit = 2000): string[] {
  if (arr.includes(v)) return arr;
  const next = [v, ...arr];
  return next.length > limit ? next.slice(0, limit) : next;
}

async function fileToBase64(file: File): Promise<{ base64: string; name: string; contentType: string }> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const res = String(r.result || "");
      const idx = res.indexOf(",");
      resolve(idx >= 0 ? res.slice(idx + 1) : res);
    };
    r.onerror = () => reject(new Error("Failed to read file"));
    r.readAsDataURL(file);
  });

  return {
    base64,
    name: file.name || "file.bin",
    contentType: file.type || "application/octet-stream",
  };
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<
    "dashboard" | "inbox" | "add" | "list" | "customer_insights" | "agent_insights" | "products"
  >("dashboard");

  const [authed, setAuthed] = useState<boolean>(() => {
    const local = localStorage.getItem("support_intel_auth") === "1";
    const sess = sessionStorage.getItem("support_intel_auth") === "1";
    return local || sess;
  });

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [booted, setBooted] = useState(false);
  const [loading, setLoading] = useState(true);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((type: ToastType, message: string) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const commitTickets = useCallback((updater: (prev: SupportTicket[]) => SupportTicket[]) => {
    setTickets((prev) => {
      const next = updater(prev);
      void saveTicketsSmart(next);
      return next;
    });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const remoteIsOn = remoteMode() === "supabase";
        const { tickets: initial, source } = await loadTicketsSharedFirst();

        if (source === "remote") {
          setTickets(initial);
          setBooted(true);
          showToast("success", `Loaded ${initial.length} tickets from remote storage`);
          return;
        }

        if (source === "local") {
          setTickets(initial);
          setBooted(true);
          showToast("info", `Loaded ${initial.length} tickets from local storage`);

          if (remoteIsOn && initial.length) {
            saveLocalTickets(initial);
            await saveTicketsSmart(initial);
          }
          return;
        }

        let migrated: SupportTicket[] = [];
        const legacy = localStorage.getItem(STORAGE_KEYS.ISSUES_V1);
        if (legacy) {
          try {
            migrated = migrateLegacyIssuesToTickets(JSON.parse(legacy));
            showToast("info", `Migrated ${migrated.length} legacy tickets`);
          } catch {
            migrated = [];
          }
        }

        setTickets(migrated);
        setBooted(true);

        if (remoteIsOn) {
          await saveTicketsSmart(migrated);
        } else {
          saveLocalTickets(migrated);
        }
      } catch (error) {
        console.error("Failed to load tickets:", error);
        showToast("error", "Failed to load tickets. Check console for details.");
        setTickets([]);
        setBooted(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [showToast]);

  useEffect(() => {
    if (!booted) return;
    const timer = window.setTimeout(() => {
      void saveTicketsSmart(tickets);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [tickets, booted]);

  const upsertMessageIntoTickets = useCallback(
    (input: TicketMessageInput) => {
      const nowIso = new Date().toISOString();
      const emailNorm = normalizeEmail(input.customerEmail || "");
      const customerKey = buildCustomerKey(emailNorm, (input as any).customerFallbackId);

      commitTickets((prev) => {
        const sorted = [...prev].sort(
          (a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
        );

        const latestForCustomer = sorted.find((t) => t.customerKey === customerKey);

        const canAppend =
          latestForCustomer &&
          Date.now() - new Date(latestForCustomer.lastActivityAt).getTime() <= SEVEN_DAYS_MS &&
          latestForCustomer.status !== "Closed";

        const newMsg = {
          id: crypto.randomUUID(),
          customerKey,
          channel: input.channel,
          customerText: input.customerText,
          agentReplyText: input.agentReplyText || "",
          orderId: input.orderId || "",
          productId: input.productId || "",
          productName: input.productName || "",
          productAmazonId: input.productAmazonId || "",
          createdAt: nowIso,
          customerAnalysis: input.customerAnalysis,
          agentAnalysis: input.agentAnalysis,
          external: input.external || {},
        };

        if (canAppend && latestForCustomer) {
          return prev.map((t) => {
            if (t.id !== latestForCustomer.id) return t;

            const shouldReopen = t.status === "Resolved" || t.status === "Closed";

            const rootCausePrimary =
              t.rootCausePrimary && t.rootCausePrimary !== "Uncategorized"
                ? t.rootCausePrimary
                : input.customerAnalysis.rootCausePrimary;

            return {
              ...t,
              customerName: input.customerName || t.customerName,
              customerEmail: emailNorm || t.customerEmail,
              lastActivityAt: nowIso,
              status: shouldReopen ? "Reopened" : t.status,
              rootCausePrimary,
              rootCauseSecondary: t.rootCauseSecondary || input.customerAnalysis.rootCauseSecondary || "",
              replacementRequested: t.replacementRequested || input.customerAnalysis.replacementRequested,
              troubleshootingApplied: t.troubleshootingApplied || input.customerAnalysis.troubleshootingApplied,
              severity: maxSeverity(t.severity, input.customerAnalysis.severity),
              messages: [newMsg, ...t.messages],
            };
          });
        }

        const newTicket: SupportTicket = {
          id: crypto.randomUUID(),
          customerKey,
          customerName: input.customerName || "",
          customerEmail: emailNorm,
          createdAt: nowIso,
          lastActivityAt: nowIso,
          status: input.customerAnalysis.suggestedStatus || "Open",
          severity: input.customerAnalysis.severity || "Normal",
          rootCausePrimary: input.customerAnalysis.rootCausePrimary,
          rootCauseSecondary: input.customerAnalysis.rootCauseSecondary || "",
          replacementRequested: input.customerAnalysis.replacementRequested || false,
          troubleshootingApplied: input.customerAnalysis.troubleshootingApplied || false,
          messages: [newMsg],
        };

        return [newTicket, ...prev];
      });
    },
    [commitTickets]
  );

  const handleManualAnalyzeAndSave = async (payload: {
    customerName: string;
    customerEmail: string;
    orderId?: string;
    productId?: string;
    productName?: string;
    productAmazonId?: string;
    chatConversation: string;
  }) => {
    try {
      const { customerText, agentReplyText, detectedProduct, chatMetadata } = await analyzeCustomerMessage(
        payload.chatConversation,
        {
          productName: payload.productName || "",
          productAmazonId: payload.productAmazonId || "",
          orderId: payload.orderId || "",
        }
      );

      const agentAnalysis = await analyzeAgentReply(agentReplyText, {
        customerText: customerText.text,
        customerRootCausePrimary: customerText.rootCausePrimary,
        customerSentiment: customerText.sentiment,
        replacementRequested: customerText.replacementRequested,
        troubleshootingApplied: customerText.troubleshootingApplied,
        totalReplies: chatMetadata.agentTurns,
      });

      const finalProductId = payload.productId || detectedProduct?.id || "";
      const finalProductName = payload.productName || detectedProduct?.name || "";
      const finalProductAmazonId = payload.productAmazonId || detectedProduct?.amazonId || "";

      upsertMessageIntoTickets({
        customerName: payload.customerName,
        customerEmail: payload.customerEmail,
        channel: "Manual",
        customerText: customerText.text,
        agentReplyText,
        orderId: payload.orderId,
        productId: finalProductId,
        productName: finalProductName,
        productAmazonId: finalProductAmazonId,
        customerAnalysis: customerText,
        agentAnalysis,
      } as any);

      showToast("success", "Chat analyzed and saved!");
      setActiveTab("list");
    } catch (error) {
      console.error("Analysis failed:", error);
      showToast("error", "Failed to analyze chat. Please try again.");
      throw error;
    }
  };

  const handleDeleteTicket = useCallback(
    (ticketId: string) => {
      const newTickets = tickets.filter((t) => t.id !== ticketId);
      setTickets(newTickets);
      saveLocalTickets(newTickets);
      if (remoteMode() === "supabase") {
        saveRemoteTickets(newTickets);
      }
      showToast("success", "Ticket deleted successfully");
    },
    [tickets, showToast]
  );

  const handleDeleteMessage = useCallback(
    (ticketId: string, messageId: string) => {
      commitTickets((prev) => {
        const next = prev
          .map((t) => {
            if (t.id !== ticketId) return t;
            const msgs = t.messages.filter((m) => m.id !== messageId);
            return { ...t, messages: msgs };
          })
          .filter((t) => t.messages.length > 0);

        return next;
      });
      showToast("success", "Message deleted successfully");
    },
    [commitTickets, showToast]
  );

  if (!authed) {
    return <LoginPage onSuccess={() => setAuthed(true)} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600 font-medium">Loading tickets...</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <Layout
        activeTab={activeTab as any}
        setActiveTab={setActiveTab as any}
        onLogout={() => {
          localStorage.removeItem("support_intel_auth");
          sessionStorage.removeItem("support_intel_auth");
          setAuthed(false);
          showToast("info", "Logged out successfully");
        }}
      >
        {activeTab === "dashboard" && <Dashboard tickets={tickets} />}
        {activeTab === "customer_insights" && <CustomerInsights tickets={tickets} />}
        {activeTab === "agent_insights" && <AgentInsights tickets={tickets} />}
        {activeTab === "products" && <ProductInsights tickets={tickets} />}

        {activeTab === "inbox" && (
          <InboxView
            tickets={tickets}
            onUpsert={upsertMessageIntoTickets}
            commitTickets={commitTickets}
            showToast={showToast}
          />
        )}

        {activeTab === "add" && (
          <AddIssue tickets={tickets} onAnalyzeAndSave={handleManualAnalyzeAndSave} showToast={showToast} />
        )}

        {activeTab === "list" && (
          <IssueList
            tickets={tickets}
            onUpdateTicket={(ticketId, patch) => {
              commitTickets((prev) => prev.map((t) => (t.id === ticketId ? { ...t, ...patch } : t)));
              showToast("success", "Ticket updated");
            }}
            onDeleteTicket={handleDeleteTicket}
            onDeleteMessage={handleDeleteMessage}
          />
        )}
      </Layout>

      <div className="fixed bottom-4 right-4 z-50 space-y-2">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            type={toast.type}
            message={toast.message}
            onClose={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
          />
        ))}
      </div>
    </ErrorBoundary>
  );
};

function severityRank(s: "Normal" | "Urgent" | "Critical"): number {
  if (s === "Critical") return 3;
  if (s === "Urgent") return 2;
  return 1;
}

function maxSeverity(
  a: "Normal" | "Urgent" | "Critical",
  b: "Normal" | "Urgent" | "Critical"
): "Normal" | "Urgent" | "Critical" {
  return severityRank(a) >= severityRank(b) ? a : b;
}
function InboxView(props: {
  tickets: SupportTicket[];
  onUpsert: (input: TicketMessageInput) => void;
  commitTickets: (updater: (prev: SupportTicket[]) => SupportTicket[]) => void;
  showToast: (type: ToastType, message: string) => void;
}) {
  const { tickets, onUpsert, commitTickets, showToast } = props;

  const webAppUrl = useMemo(() => {
    const saved = localStorage.getItem(LS_WEBAPP_URL);
    const url = (saved || DEFAULT_GMAIL_WEBAPP_URL).trim();
    if (!saved) localStorage.setItem(LS_WEBAPP_URL, url);
    return url;
  }, []);

  const [loadingInbox, setLoadingInbox] = useState(false);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string>("");
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadMessages, setThreadMessages] = useState<InboxItem[]>([]);
  const [replyText, setReplyText] = useState("");
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [threadDetails, setThreadDetails] = useState<any>(null);
  const [detailsForm, setDetailsForm] = useState({
    customerName: "",
    customerEmail: "",
    phoneNumber: "",
    orderNumber: "",
    customLink: "",
    productIssue: "",
    pipelineStage: "New Lead",
    priority: "Medium",
  });

  const [attCache, setAttCache] = useState<Record<string, { kind: "image" | "file"; url: string; name: string }>>({});

  const [hiddenThreads, setHiddenThreads] = useState<Set<string>>(() => {
    const raw = localStorage.getItem(LS_HIDDEN_THREADS) || "[]";
    return new Set<string>(safeJsonParse<string[]>(raw, []));
  });

  const [seenThreads, setSeenThreads] = useState<Set<string>>(() => {
    const raw = localStorage.getItem(LS_SEEN_MESSAGE_IDS) || "[]";
    return new Set<string>(safeJsonParse<string[]>(raw, []));
  });

  const getLastSeenMs = () => {
    const v = Number(localStorage.getItem(LS_LAST_SEEN_MS) || "0");
    return Number.isFinite(v) ? v : 0;
  };

  const setLastSeenMs = (ms: number) => {
    localStorage.setItem(LS_LAST_SEEN_MS, String(ms));
  };

  const markThreadAsSeen = (threadId: string) => {
    const raw = localStorage.getItem(LS_SEEN_MESSAGE_IDS) || "[]";
    const list = safeJsonParse<string[]>(raw, []);
    const next = uniqPushLimited(list, threadId, 2500);
    localStorage.setItem(LS_SEEN_MESSAGE_IDS, JSON.stringify(next));
    setSeenThreads(new Set(next));
  };

  const hideThreadLocal = (threadId: string) => {
    const raw = localStorage.getItem(LS_HIDDEN_THREADS) || "[]";
    const list = safeJsonParse<string[]>(raw, []);
    const next = uniqPushLimited(list, threadId, 5000);
    localStorage.setItem(LS_HIDDEN_THREADS, JSON.stringify(next));
    setHiddenThreads(new Set(next));
    showToast("info", "Hidden from Inbox");
    setInbox((prev) => prev.filter((x) => x.threadId !== threadId));
    if (selectedThreadId === threadId) {
      setSelectedThreadId("");
      setThreadMessages([]);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const supabaseMessages = await getInboxMessages(120);
        if (supabaseMessages.length > 0) {
          const converted: InboxItem[] = supabaseMessages.map((msg: any) => ({
            threadId: msg.thread_id,
            messageId: msg.message_id,
            dateISO: msg.date_iso,
            dateMs: msg.date_ms,
            subject: msg.subject || "",
            fromRaw: msg.from_raw,
            fromName: msg.from_name,
            fromEmail: msg.from_email,
            toRaw: msg.to_raw,
            ccRaw: msg.cc_raw,
            bccRaw: msg.bcc_raw,
            isFromMe: msg.is_from_me,
            bodyText: msg.body_text,
            hasAttachments: msg.has_attachments,
            attachments: [],
            customerKey: msg.customer_key,
            pipelineStage: msg.pipeline_stage || "New Lead",
            priority: msg.priority || "Medium",
          }));
          setInbox(converted);
          
          const threadsWithReplies = converted
            .filter(msg => msg.isFromMe)
            .map(msg => msg.threadId);
          
          if (threadsWithReplies.length > 0) {
            const raw = localStorage.getItem(LS_SEEN_MESSAGE_IDS) || "[]";
            const existing = safeJsonParse<string[]>(raw, []);
            const updated = [...new Set([...existing, ...threadsWithReplies])];
            localStorage.setItem(LS_SEEN_MESSAGE_IDS, JSON.stringify(updated));
            setSeenThreads(new Set(updated));
          }
          
          showToast("success", `Loaded ${converted.length} messages from database`);
        }
      } catch (err) {
        console.error("Failed to load from Supabase:", err);
      }
    })();
  }, [showToast]);

  const fetchInbox = useCallback(
    async (sinceMs: number) => {
      const url = `${webAppUrl}?route=inbox&since=${encodeURIComponent(String(sinceMs))}&max=25`;
      const res = await jsonp<{ ok: boolean; items?: InboxItem[]; count?: number; error?: string }>(url);
      if (!res?.ok) throw new Error(res?.error || "Inbox fetch failed");
      const items = Array.isArray(res.items) ? res.items : [];
      const filtered = items.filter((it) => !hiddenThreads.has(it.threadId));
      
      for (const item of filtered) {
        try {
          await saveInboxMessage({
            thread_id: item.threadId,
            message_id: item.messageId,
            date_iso: item.dateISO,
            date_ms: item.dateMs,
            subject: item.subject || "",
            from_raw: item.fromRaw,
            from_name: item.fromName,
            from_email: item.fromEmail,
            to_raw: item.toRaw,
            cc_raw: item.ccRaw,
            bcc_raw: item.bccRaw,
            is_from_me: item.isFromMe,
            body_text: item.bodyText,
            has_attachments: item.hasAttachments,
            customer_key: item.customerKey,
          });

          if (item.hasAttachments && Array.isArray(item.attachments)) {
            for (const att of item.attachments) {
              await saveInboxAttachment({
                message_id: item.messageId,
                attachment_index: att.index,
                file_name: att.name,
                content_type: att.contentType,
                is_image: att.isImage,
              });
            }
          }
        } catch (err) {
          console.error("Failed to save message to Supabase:", err);
        }
      }
      
      return filtered;
    },
    [webAppUrl, hiddenThreads]
  );

  const fetchThread = useCallback(
    async (threadId: string) => {
      const url = `${webAppUrl}?route=thread&threadId=${encodeURIComponent(threadId)}`;
      const res = await jsonp<ThreadResponse>(url);
      if (!res?.ok) throw new Error("Thread fetch failed");
      const messages = Array.isArray(res.messages) ? res.messages : [];
      
      for (const msg of messages) {
        try {
          await saveInboxMessage({
            thread_id: msg.threadId,
            message_id: msg.messageId,
            date_iso: msg.dateISO,
            date_ms: msg.dateMs,
            subject: msg.subject || "",
            from_raw: msg.fromRaw,
            from_name: msg.fromName,
            from_email: msg.fromEmail,
            to_raw: msg.toRaw,
            cc_raw: msg.ccRaw,
            bcc_raw: msg.bccRaw,
            is_from_me: msg.isFromMe,
            body_text: msg.bodyText,
            has_attachments: msg.hasAttachments,
            customer_key: msg.customerKey,
          });

          if (msg.hasAttachments && Array.isArray(msg.attachments)) {
            for (const att of msg.attachments) {
              await saveInboxAttachment({
                message_id: msg.messageId,
                attachment_index: att.index,
                file_name: att.name,
                content_type: att.contentType,
                is_image: att.isImage,
              });
            }
          }
        } catch (err) {
          console.error("Failed to save thread message:", err);
        }
      }
      
      return messages;
    },
    [webAppUrl]
  );

  const fetchAttachment = useCallback(
    async (threadId: string, messageId: string, attIndex: number) => {
      const key = `${messageId}:${attIndex}`;
      if (attCache[key]) return attCache[key];

      const url = `${webAppUrl}?route=attachment&threadId=${encodeURIComponent(threadId)}&messageId=${encodeURIComponent(
        messageId
      )}&attIndex=${encodeURIComponent(String(attIndex))}`;

      const res = await jsonp<{
        ok: boolean;
        name: string;
        contentType: string;
        isImage: boolean;
        base64: string;
        dataUrl: string | null;
        error?: string;
      }>(url);

      if (!res?.ok) throw new Error(res?.error || "Attachment fetch failed");

      if (res.isImage && res.dataUrl) {
        const entry = { kind: "image" as const, url: res.dataUrl, name: res.name };
        setAttCache((prev) => ({ ...prev, [key]: entry }));
        return entry;
      }

      const bytes = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: res.contentType || "application/octet-stream" });
      const blobUrl = URL.createObjectURL(blob);

      const entry = { kind: "file" as const, url: blobUrl, name: res.name };
      setAttCache((prev) => ({ ...prev, [key]: entry }));
      return entry;
    },
    [webAppUrl, attCache]
  );

  const analyzeThread = useCallback(async () => {
    if (!selectedThreadId || threadMessages.length === 0) return;

    setAnalyzing(true);
    showToast("info", "🔍 Analyzing conversation...");

    try {
      const customerMsgs = threadMessages.filter((m) => !m.isFromMe).map((m) => `Customer: ${m.bodyText}`);
      const agentMsgs = threadMessages.filter((m) => m.isFromMe).map((m) => `Agent: ${m.bodyText}`);

      const chatConversation = [...customerMsgs, ...agentMsgs].join("\n");

      const firstCustomer = threadMessages.find((m) => !m.isFromMe);

      const { customerText, agentReplyText, detectedProduct } = await analyzeCustomerMessage(chatConversation, {});

      if (!customerText.text) {
        showToast("warning", "No product-related content found");
        setAnalyzing(false);
        return;
      }

      let agentAnalysis;
      if (agentMsgs.length > 0) {
        agentAnalysis = await analyzeAgentReply(agentReplyText, {
          customerText: customerText.text,
          customerRootCausePrimary: customerText.rootCausePrimary,
          customerSentiment: customerText.sentiment,
          replacementRequested: customerText.replacementRequested,
          troubleshootingApplied: customerText.troubleshootingApplied,
          totalReplies: agentMsgs.length,
        });
      }

      onUpsert({
        customerName: firstCustomer?.fromName || "",
        customerEmail: firstCustomer?.fromEmail || "",
        channel: "Gmail",
        customerText: customerText.text,
        agentReplyText,
        productId: detectedProduct?.id || "",
        productName: detectedProduct?.name || "",
        productAmazonId: detectedProduct?.amazonId || "",
        customerAnalysis: customerText,
        agentAnalysis,
        external: {
          threadId: selectedThreadId,
          subject: firstCustomer?.subject || "",
        },
      } as any);

      showToast("success", "✅ Analysis complete!");
    } catch (err) {
      console.error("Analysis failed:", err);
      showToast("error", "❌ Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }, [selectedThreadId, threadMessages, onUpsert, showToast]);

  useEffect(() => {
    let alive = true;
    let timer: number | null = null;

    const tick = async () => {
      if (!alive) return;
      try {
        setLoadingInbox(true);
        const since = getLastSeenMs();
        const items = await fetchInbox(since);

        const maxMs = items.reduce((acc, x) => Math.max(acc, x.dateMs || 0), since);
        if (maxMs > since) setLastSeenMs(maxMs);

        setInbox((prev) => {
          const map = new Map<string, InboxItem>();
          for (const p of prev) map.set(p.messageId, p);
          for (const it of items) map.set(it.messageId, it);
          const next = Array.from(map.values()).sort((a, b) => (b.dateMs || 0) - (a.dateMs || 0));
          const limited = next.slice(0, 120);

          localStorage.setItem(LS_INBOX_ITEMS, JSON.stringify(limited));

          return limited;
        });
      } catch (e) {
        console.error("Inbox poll failed:", e);
      } finally {
        setLoadingInbox(false);
      }
    };

    void tick();

    timer = window.setInterval(() => {
      void tick();
    }, INBOX_POLL_MS);

    return () => {
      alive = false;
      if (timer) window.clearInterval(timer);
    };
  }, [fetchInbox]);

  const openThread = useCallback(
    async (threadId: string) => {
      setSelectedThreadId(threadId);
      setThreadLoading(true);
      markThreadAsSeen(threadId);
      try {
        const supabaseMessages = await getThreadMessages(threadId);
        if (supabaseMessages.length > 0) {
          const converted: InboxItem[] = await Promise.all(
            supabaseMessages.map(async (msg: any) => {
              const attachments = await getAttachmentsByMessageId(msg.message_id);
              return {
                threadId: msg.thread_id,
                messageId: msg.message_id,
                dateISO: msg.date_iso,
                dateMs: msg.date_ms,
                subject: msg.subject || "",
                fromRaw: msg.from_raw,
                fromName: msg.from_name,
                fromEmail: msg.from_email,
                toRaw: msg.to_raw,
                ccRaw: msg.cc_raw,
                bccRaw: msg.bcc_raw,
                isFromMe: msg.is_from_me,
                bodyText: msg.body_text,
                hasAttachments: msg.has_attachments,
                attachments: attachments.map((att: any) => ({
                  index: att.attachment_index,
                  name: att.file_name,
                  contentType: att.content_type,
                  isImage: att.is_image,
                })),
                customerKey: msg.customer_key,
              };
            })
          );
          setThreadMessages(converted);
        } else {
          const msgs = await fetchThread(threadId);
          setThreadMessages(msgs);
        }

        const details = await getThreadDetails(threadId);
        setThreadDetails(details);
        
        const firstCustomer = supabaseMessages.find((m: any) => !m.is_from_me);
        setDetailsForm({
          customerName: firstCustomer?.from_name || "",
          customerEmail: firstCustomer?.from_email || "",
          phoneNumber: details?.phone_number || "",
          orderNumber: details?.order_number || "",
          customLink: details?.custom_link || "",
          productIssue: details?.product_issue || "",
          pipelineStage: details?.pipeline_stage || "New Lead",
          priority: details?.priority || "Medium",
        });
      } catch (e) {
        console.error(e);
        showToast("error", "Failed to load thread");
        setThreadMessages([]);
      } finally {
        setThreadLoading(false);
      }
    },
    [fetchThread, showToast]
  );
  const selectedThreadMeta = useMemo(() => {
    const first = threadMessages.find((m) => !m.isFromMe) || threadMessages[0];
    return {
      customerName: first?.fromName || "",
      customerEmail: first?.fromEmail || "",
      subject: first?.subject || "",
    };
  }, [threadMessages]);

  const sendReply = useCallback(async () => {
    if (!selectedThreadId) return;
    const text = replyText.trim();
    if (!text && replyFiles.length === 0) {
      showToast("warning", "Write a reply or attach a file");
      return;
    }

    setSending(true);
    try {
      let attachments: Array<{ base64: string; name: string; contentType: string }> = [];

      if (replyFiles.length > 0) {
        try {
          attachments = await Promise.all(replyFiles.map((f) => fileToBase64(f)));
        } catch (fileErr) {
          console.error("File conversion failed:", fileErr);
          showToast("error", "Failed to process attachments");
          setSending(false);
          return;
        }
      }

      await fetch(`${webAppUrl}?route=reply`, {
        method: "POST",
        mode: "no-cors",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify({
          key: GMAIL_API_KEY,
          threadId: selectedThreadId,
          text,
          attachments,
        }),
      });

      setReplyText("");
      setReplyFiles([]);
      showToast("success", "Reply sent successfully!");

      setTimeout(async () => {
        try {
          const msgs = await fetchThread(selectedThreadId);
          setThreadMessages(msgs);
        } catch {}
      }, 1500);
    } catch (e) {
      console.error(e);
      showToast("error", "Failed to send reply");
    } finally {
      setSending(false);
    }
  }, [selectedThreadId, replyText, replyFiles, webAppUrl, fetchThread, showToast]);

  const onReplyKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendReply();
    }
  };

  const handleSaveDetails = async () => {
    if (!selectedThreadId) return;
    try {
      await updateThreadDetails(selectedThreadId, {
        phone_number: detailsForm.phoneNumber,
        order_number: detailsForm.orderNumber,
        custom_link: detailsForm.customLink,
        product_issue: detailsForm.productIssue,
        pipeline_stage: detailsForm.pipelineStage,
        priority: detailsForm.priority,
      });
      
      setInbox((prev) => prev.map((item) => 
        item.threadId === selectedThreadId 
          ? { ...item, pipelineStage: detailsForm.pipelineStage, priority: detailsForm.priority }
          : item
      ));
      
      showToast("success", "Details saved successfully!");
      setShowDetailsModal(false);
    } catch (err) {
      console.error(err);
      showToast("error", "Failed to save details");
    }
  };

  const handlePipelineChange = async (stage: string) => {
    if (!selectedThreadId) return;
    try {
      await updateThreadDetails(selectedThreadId, { pipeline_stage: stage });
      setDetailsForm((prev) => ({ ...prev, pipelineStage: stage }));
      setInbox((prev) => prev.map((item) => 
        item.threadId === selectedThreadId ? { ...item, pipelineStage: stage } : item
      ));
      showToast("success", `Pipeline updated to ${stage}`);
    } catch (err) {
      showToast("error", "Failed to update pipeline");
    }
  };

  const displayInbox = useMemo(() => {
    const threadMap = new Map<string, InboxItem>();
    inbox.forEach((item) => {
      const existing = threadMap.get(item.threadId);
      if (!existing || item.dateMs > existing.dateMs) {
        threadMap.set(item.threadId, item);
      }
    });
    return Array.from(threadMap.values()).sort((a, b) => b.dateMs - a.dateMs);
  }, [inbox]);

  const getPipelineColor = (stage: string) => {
    const found = PIPELINE_STAGES.find((s) => s.value === stage);
    return found?.color || "bg-gray-100 text-gray-800 border-gray-300";
  };

  return (
    <div className="w-full h-full font-sans">
      {!selectedThreadId ? (
        <div className="space-y-3">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  📬 Gmail Inbox
                  {loadingInbox && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600"></div>}
                </div>
                <div className="text-xs text-gray-500 font-medium">{displayInbox.length} conversations</div>
              </div>
              <button
                className="text-xs px-3 py-1.5 rounded-xl border border-indigo-200 bg-white hover:bg-indigo-50 font-semibold text-indigo-600 transition"
                onClick={() => {
                  localStorage.removeItem(LS_LAST_SEEN_MS);
                  localStorage.removeItem(LS_INBOX_ITEMS);
                  setInbox([]);
                  showToast("info", "Inbox reset");
                }}
              >
                🔄 Reset
              </button>
            </div>
          </div>

          {displayInbox.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-12 text-center">
              <div className="text-6xl mb-4">📭</div>
              <div className="text-sm text-gray-500 font-medium">No messages yet</div>
            </div>
          ) : (
            <div className="space-y-3">
              {displayInbox.map((it) => {
                const isNew = !seenThreads.has(it.threadId);
                const pipelineColor = getPipelineColor(it.pipelineStage || "New Lead");
                
                return (
                  <div
                    key={it.threadId}
                    className="bg-white rounded-2xl shadow-sm border-2 border-gray-200 p-4 hover:border-indigo-400 cursor-pointer transition-all relative"
                    onClick={() => void openThread(it.threadId)}
                  >
                    {isNew && <div className="absolute top-3 right-3 w-3 h-3 bg-blue-600 rounded-full animate-pulse"></div>}
                    
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`text-xs px-3 py-1 rounded-full font-bold border-2 ${pipelineColor}`}>
                            {PIPELINE_STAGES.find((s) => s.value === (it.pipelineStage || "New Lead"))?.label}
                          </span>
                          {isNew && <span className="text-xs px-2 py-1 rounded-full bg-blue-600 text-white font-bold">NEW</span>}
                        </div>
                        
                        <div className="text-base font-bold text-gray-900 truncate mb-1">
                          👤 {it.fromName || it.fromEmail || "Unknown sender"}
                        </div>
                        <div className="text-sm text-gray-600 truncate mb-2">{it.fromEmail}</div>
                        <div className="text-sm font-semibold text-gray-800 truncate mb-2">{it.subject || "(no subject)"}</div>
                        <div className="text-sm text-gray-600 line-clamp-2">{it.bodyText || ""}</div>
                      </div>
                      
                      <div className="text-xs text-gray-400 whitespace-nowrap">
                        {new Date(it.dateMs).toLocaleDateString()}
                      </div>
                    </div>
                    
                    <div className="mt-3 flex items-center gap-2">
                      {it.hasAttachments && (
                        <span className="text-xs px-2 py-1 rounded-full bg-gray-100 border text-gray-600 font-semibold">
                          📎 {it.attachments?.length || 1}
                        </span>
                      )}
                      {!it.isFromMe && (
                        <span className="text-xs px-2 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 font-semibold">
                          Inbound
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-indigo-50 to-white">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <button
                  onClick={() => {
                    setSelectedThreadId("");
                    setThreadMessages([]);
                  }}
                  className="text-sm px-3 py-2 rounded-xl border-2 border-gray-300 bg-white hover:bg-gray-50 font-semibold text-gray-700 transition"
                >
                  ← Back
                </button>
                
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={detailsForm.pipelineStage}
                    onChange={(e) => handlePipelineChange(e.target.value)}
                    className={`text-xs px-3 py-2 rounded-xl border-2 font-bold transition ${getPipelineColor(detailsForm.pipelineStage)}`}
                  >
                    {PIPELINE_STAGES.map((stage) => (
                      <option key={stage.value} value={stage.value}>
                        {stage.label}
                      </option>
                    ))}
                  </select>
                  
                  <button
                    onClick={() => setShowDetailsModal(true)}
                    className="text-xs px-3 py-2 rounded-xl border-2 border-green-200 bg-green-50 hover:bg-green-100 font-semibold text-green-700 transition"
                  >
                    📝 Add Details
                  </button>
                  
                  <button
                    onClick={() => void analyzeThread()}
                    disabled={analyzing || threadMessages.length === 0}
                    className="text-xs px-3 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-purple-700 text-white font-bold hover:from-purple-700 hover:to-purple-800 disabled:opacity-50 transition"
                  >
                    {analyzing ? "Analyzing..." : "🔍 Analyze"}
                  </button>
                </div>
              </div>
              
              <div className="text-xs text-gray-600 mt-2">
                <span className="font-semibold">{selectedThreadMeta.customerName || selectedThreadMeta.customerEmail}</span>
                {" • "}
                {selectedThreadMeta.subject || "(no subject)"}
              </div>
            </div>

            <div className="max-h-[50vh] overflow-auto p-4 space-y-3 bg-gradient-to-b from-gray-50 to-white">
              {threadLoading ? (
                <div className="flex items-center justify-center h-full min-h-[200px]">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                </div>
              ) : threadMessages.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-4xl mb-2">📭</div>
                  <div className="text-sm text-gray-500">No messages</div>
                </div>
              ) : (
                threadMessages.map((m) => {
                  const isMe = m.isFromMe;
                  return (
                    <div key={m.messageId} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-md border-2 ${
                          isMe
                            ? "bg-gradient-to-br from-indigo-600 to-indigo-700 text-white border-indigo-600"
                            : "bg-white text-gray-900 border-gray-200"
                        }`}
                      >
                        <div className="text-xs opacity-90 mb-2 font-semibold">
                          {isMe ? "🧑💼 You" : `👤 ${m.fromName || m.fromEmail}`}
                        </div>
                        <div className={`text-sm whitespace-pre-wrap break-words ${isMe ? "text-white" : "text-gray-800"}`}>
                          {m.bodyText || ""}
                        </div>
                        {m.hasAttachments && m.attachments.length > 0 && (
                          <div className="mt-2 space-y-2">
                            {m.attachments.map((a) => {
                              const cacheKey = `${m.messageId}:${a.index}`;
                              const cached = attCache[cacheKey];
                              return (
                                <div key={cacheKey} className="rounded-xl border-2 border-gray-300 bg-white p-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="text-xs font-bold text-gray-800 truncate">📎 {a.name}</div>
                                    {!cached ? (
                                      <button
                                        className="text-xs px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 font-semibold text-indigo-700"
                                        onClick={async () => {
                                          try {
                                            await fetchAttachment(m.threadId, m.messageId, a.index);
                                          } catch {}
                                        }}
                                      >
                                        Load
                                      </button>
                                    ) : cached.kind === "file" ? (
                                      <a
                                        href={cached.url}
                                        download={cached.name}
                                        className="text-xs px-2 py-1 rounded-lg bg-green-50 hover:bg-green-100 font-semibold text-green-700"
                                      >
                                        Download
                                      </a>
                                    ) : null}
                                  </div>
                                  {cached?.kind === "image" && (
                                    <img src={cached.url} alt={cached.name} className="mt-2 max-h-48 rounded-lg" />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="border-t-2 border-gray-200 p-4 bg-white">
              <div className="flex flex-col gap-3">
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={onReplyKeyDown}
                  disabled={sending}
                  placeholder="✍️ Type your reply..."
                  className="w-full min-h-[80px] rounded-xl border-2 border-gray-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                />
                <div className="flex items-center justify-between gap-3">
                  <label className="text-sm px-3 py-2 rounded-xl border-2 border-indigo-200 bg-indigo-50 hover:bg-indigo-100 cursor-pointer font-semibold text-indigo-700">
                    📎 Attach
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      disabled={sending}
                      onChange={(e) => {
                        const files = e.target.files ? Array.from(e.target.files) : [];
                        setReplyFiles(files);
                      }}
                    />
                  </label>
                  {replyFiles.length > 0 && (
                    <div className="text-xs text-gray-700 font-semibold">✅ {replyFiles.length} file(s)</div>
                  )}
                  <button
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 text-white text-sm font-bold hover:from-indigo-700 hover:to-indigo-800 disabled:opacity-50"
                    disabled={sending || (!replyText.trim() && replyFiles.length === 0)}
                    onClick={() => void sendReply()}
                  >
                    {sending ? "Sending..." : "📤 Send"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDetailsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-auto">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900">📝 Add Details</h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Customer Name</label>
                <input
                  type="text"
                  value={detailsForm.customerName}
                  disabled
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={detailsForm.customerEmail}
                  disabled
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Phone Number</label>
                <input
                  type="text"
                  value={detailsForm.phoneNumber}
                  onChange={(e) => setDetailsForm((prev) => ({ ...prev, phoneNumber: e.target.value }))}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:border-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Order Number</label>
                <input
                  type="text"
                  value={detailsForm.orderNumber}
                  onChange={(e) => setDetailsForm((prev) => ({ ...prev, orderNumber: e.target.value }))}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:border-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Custom Link</label>
                <input
                  type="url"
                  value={detailsForm.customLink}
                  onChange={(e) => setDetailsForm((prev) => ({ ...prev, customLink: e.target.value }))}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:border-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Product Issue</label>
                <input
                  type="text"
                  value={detailsForm.productIssue}
                  onChange={(e) => setDetailsForm((prev) => ({ ...prev, productIssue: e.target.value }))}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:border-indigo-500 outline-none"
                />
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex gap-3">
              <button
                onClick={() => setShowDetailsModal(false)}
                className="flex-1 px-4 py-2 rounded-xl border-2 border-gray-300 bg-white hover:bg-gray-50 font-semibold text-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveDetails}
                className="flex-1 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 text-white font-bold hover:from-indigo-700 hover:to-indigo-800"
              >
                💾 Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
