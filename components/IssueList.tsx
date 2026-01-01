import React, { useMemo, useState } from "react";
import { SupportTicket, TicketStatus, TAGS } from "../types";

interface IssueListProps {
  tickets: SupportTicket[];
  onUpdateTicket: (ticketId: string, patch: Partial<SupportTicket>) => void;
  onDeleteTicket: (ticketId: string) => void;
  onDeleteMessage: (ticketId: string, messageId: string) => void;
}

const IssueList: React.FC<IssueListProps> = ({
  tickets,
  onUpdateTicket,
  onDeleteTicket,
  onDeleteMessage,
}) => {
  const [search, setSearch] = useState("");
  const [selectedCustomerKey, setSelectedCustomerKey] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = [...tickets].sort(
      (a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
    );
    if (!q) return base;

    return base.filter((t) => {
      const email = (t.customerEmail || "").toLowerCase();
      const name = (t.customerName || "").toLowerCase();
      const root = (t.rootCausePrimary || "").toLowerCase();
      const status = (t.status || "").toLowerCase();

      const anyText = t.messages.some((m) => {
        const c = (m.customerText || "").toLowerCase();
        const r = (m.agentReplyText || "").toLowerCase();
        return c.includes(q) || r.includes(q);
      });

      return email.includes(q) || name.includes(q) || root.includes(q) || status.includes(q) || anyText;
    });
  }, [tickets, search]);

  const selectedTickets = useMemo(() => {
    if (!selectedCustomerKey) return [];
    return tickets
      .filter((t) => t.customerKey === selectedCustomerKey)
      .sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());
  }, [tickets, selectedCustomerKey]);

  const selectedCustomer = selectedTickets[0] || null;

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tickets</h1>
          <p className="text-sm text-gray-600">
            Click a customer → see full history (customer message + your reply + both analyses).
          </p>
        </div>

        <input
          type="text"
          placeholder="Search name, email, root cause, status, or text…"
          className="p-3 border rounded-xl w-full md:w-[440px] shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-black font-medium"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="bg-white shadow-sm rounded-2xl overflow-hidden border border-gray-100">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Customer</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Root Cause</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Messages</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Last Activity</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {filtered.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50 transition">
                  <td className="px-6 py-4">
                    <button
                      className="text-left group"
                      onClick={() => setSelectedCustomerKey(t.customerKey)}
                      title="Open customer history"
                    >
                      <div className="font-semibold text-gray-900 group-hover:text-indigo-700">
                        {t.customerName || "Unknown"}
                      </div>
                      <div className="text-sm text-gray-500">{t.customerEmail || t.customerKey}</div>
                    </button>
                  </td>

                  <td className="px-6 py-4">
                    <span className="bg-gray-900 text-white px-3 py-1 rounded-full text-xs font-bold border border-gray-900">
                      {t.rootCausePrimary}
                    </span>
                    <div className="mt-2">
                      <SeverityBadge severity={t.severity} />
                    </div>
                  </td>

                  <td className="px-6 py-4">
                    <StatusBadge status={t.status} />
                  </td>

                  <td className="px-6 py-4">
                    <div className="text-sm font-semibold text-gray-900">{t.messages.length}</div>
                  </td>

                  <td className="px-6 py-4 text-sm text-gray-800">
                    {new Date(t.lastActivityAt).toLocaleString()}
                  </td>

                  <td className="px-6 py-4">
                    <button
                      onClick={() => onDeleteTicket(t.id)}
                      className="text-gray-400 hover:text-red-600 transition font-semibold text-xs"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedCustomerKey && selectedCustomer && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSelectedCustomerKey(null)} />
          <div className="absolute right-0 top-0 h-full w-full md:w-[820px] bg-white shadow-2xl overflow-y-auto">
            <div className="p-6 border-b border-gray-100 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">{selectedCustomer.customerName}</h2>
                <p className="text-sm text-gray-600">{selectedCustomer.customerEmail}</p>
              </div>
              <button
                className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 font-semibold text-black"
                onClick={() => setSelectedCustomerKey(null)}
              >
                Close
              </button>
            </div>

            <div className="p-6">
              <div className="space-y-4">
                {selectedTickets.map((t) => (
                  <div
                    key={t.id}
                    className="p-4 rounded-2xl border border-gray-100 bg-gray-50 flex items-center justify-between"
                  >
                    <div>
                      <div className="text-sm font-bold text-gray-900">{t.rootCausePrimary}</div>
                      <div className="text-xs text-gray-500">
                        {new Date(t.lastActivityAt).toLocaleString()}
                      </div>
                    </div>

                    <select
                      value={t.status}
                      onChange={(e) => onUpdateTicket(t.id, { status: e.target.value as TicketStatus })}
                      className="border rounded-xl p-2 bg-white text-sm text-black font-semibold"
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s} className="text-black">
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div className="mt-8 space-y-6">
                {selectedTickets.flatMap((t) =>
                  t.messages.map((m) => (
                    <div
                      key={m.id}
                      className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden"
                    >
                      <div className="p-4 bg-gray-50 border-b flex justify-between items-center text-xs font-bold text-gray-500 uppercase">
                        <span>
                          {m.channel} · {new Date(m.createdAt).toLocaleString()}
                        </span>

                        <div className="flex items-center gap-3">
                          <span className="text-indigo-600">{m.customerAnalysis.sentiment}</span>

                          <button
                            onClick={() => onDeleteMessage(t.id, m.id)}
                            className="normal-case text-[11px] font-semibold text-gray-400 hover:text-red-600 transition"
                            title="Delete this message only"
                          >
                            Delete message
                          </button>
                        </div>
                      </div>

                      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-gray-900 text-white p-4 rounded-xl text-sm leading-relaxed">
                          <div className="text-[10px] uppercase font-bold text-gray-400 mb-2">Customer</div>
                          {m.customerText}
                        </div>

                        <div className="bg-indigo-50 text-black p-4 rounded-xl text-sm leading-relaxed border border-indigo-100">
                          <div className="text-[10px] uppercase font-bold text-indigo-400 mb-2">Agent Reply</div>
                          {m.agentReplyText || "No reply."}
                        </div>
                      </div>

                      {m.agentAnalysis && (
                        <div className="p-4 bg-white border-t space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-gray-900 uppercase">Score:</span>
                            <span className="text-sm font-extrabold text-indigo-600">
                              {m.agentAnalysis.overallQualityScore}/10
                            </span>
                          </div>

                          <div className="text-sm text-gray-800 italic">"{m.agentAnalysis.summary}"</div>

                          <div className="grid grid-cols-2 gap-2">
                            <InsightBox
                              title="Strengths"
                              tone="green"
                              items={m.agentAnalysis.strengthTags.map((id) => TAGS.agentStrengthName(id))}
                            />
                            <InsightBox
                              title="Weaknesses"
                              tone="red"
                              items={m.agentAnalysis.weaknessTags.map((id) => TAGS.agentWeaknessName(id))}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const STATUS_OPTIONS: TicketStatus[] = [
  "Open",
  "Troubleshooting",
  "Waiting Customer",
  "Resolved",
  "Replacement in progress",
  "Closed",
  "Reopened",
];

const StatusBadge = ({ status }: { status: TicketStatus }) => {
  const cls =
    status === "Resolved"
      ? "bg-green-100 text-green-800 border-green-200"
      : status === "Closed"
      ? "bg-gray-200 text-gray-800 border-gray-300"
      : status === "Waiting Customer"
      ? "bg-amber-100 text-amber-800 border-amber-200"
      : status === "Replacement in progress"
      ? "bg-indigo-100 text-indigo-900 border-indigo-200"
      : status === "Reopened"
      ? "bg-red-100 text-red-800 border-red-200"
      : "bg-blue-100 text-blue-800 border-blue-200";

  return <span className={`px-3 py-1 rounded-full text-xs font-bold border ${cls}`}>{status}</span>;
};

const SeverityBadge = ({ severity }: { severity: "Normal" | "Urgent" | "Critical" }) => {
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${severityChip(severity)}`}>
      {severity}
    </span>
  );
};

function severityChip(severity: "Normal" | "Urgent" | "Critical") {
  if (severity === "Critical") return "bg-red-100 text-red-800 border-red-200";
  if (severity === "Urgent") return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-gray-100 text-gray-800 border-gray-200";
}

const InsightBox = ({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "indigo" | "green" | "red" | "amber";
}) => {
  const box =
    tone === "green"
      ? "bg-green-50 border-green-200"
      : tone === "red"
      ? "bg-red-50 border-red-200"
      : tone === "amber"
      ? "bg-amber-50 border-amber-200"
      : "bg-indigo-50 border-indigo-200";

  const head =
    tone === "green"
      ? "text-green-900"
      : tone === "red"
      ? "text-red-900"
      : tone === "amber"
      ? "text-amber-900"
      : "text-indigo-900";

  return (
    <div className={`p-3 rounded-xl border ${box}`}>
      <div className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${head}`}>{title}</div>
      {items.length ? (
        <div className="flex flex-wrap gap-1">
          {items.map((x) => (
            <span
              key={x}
              className="px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-white border border-black/5 text-black"
            >
              {x}
            </span>
          ))}
        </div>
      ) : (
        <div className="text-[10px] text-gray-400 italic">None.</div>
      )}
    </div>
  );
};

export default IssueList;
