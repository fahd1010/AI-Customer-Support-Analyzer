import React, { useMemo, useState } from "react";
import { SupportTicket } from "../types";

type Timeframe = "all" | "week";

export default function CustomerInsights({ tickets }: { tickets: SupportTicket[] }) {
  const [timeframe, setTimeframe] = useState<Timeframe>("week");

  const { ticketScope, messageScope } = useMemo(() => {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const allMessages = tickets.flatMap((t) => t.messages.map((m) => ({ t, m })));

    const filteredMessages =
      timeframe === "all"
        ? allMessages
        : allMessages.filter(({ m }) => new Date(m.createdAt) >= weekAgo);

    const filteredTickets =
      timeframe === "all" ? tickets : tickets.filter((t) => new Date(t.lastActivityAt) >= weekAgo);

    return { ticketScope: filteredTickets, messageScope: filteredMessages };
  }, [tickets, timeframe]);

  const stats = useMemo(() => {
    const themeCounts: Record<string, number> = {};
    const positiveCounts: Record<string, number> = {};
    const negativeCounts: Record<string, number> = {};
    const painCounts: Record<string, number> = {};

    messageScope.forEach(({ m }) => {
      (m.customerAnalysis.themeIds || []).forEach((id) => (themeCounts[id] = (themeCounts[id] || 0) + 1));
      (m.customerAnalysis.positiveTags || []).forEach((id) => (positiveCounts[id] = (positiveCounts[id] || 0) + 1));
      (m.customerAnalysis.negativeTags || []).forEach((id) => (negativeCounts[id] = (negativeCounts[id] || 0) + 1));
      (m.customerAnalysis.painPointTags || []).forEach((id) => (painCounts[id] = (painCounts[id] || 0) + 1));
    });

    return {
      tickets: ticketScope.length,
      messages: messageScope.length,
      topThemes: topN(themeCounts, 12),
      topPositives: topN(positiveCounts, 12),
      topNegatives: topN(negativeCounts, 12),
      topPain: topN(painCounts, 12),
    };
  }, [ticketScope, messageScope]);

  return (
    <div className="space-y-6">
      <Header
        title="Customer Insights"
        subtitle="Frequencies computed only from CUSTOMER messages (separated from Agent Insights)."
        timeframe={timeframe}
        setTimeframe={setTimeframe}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Kpi label="Tickets in scope" value={stats.tickets} />
        <Kpi label="Messages in scope" value={stats.messages} />
        <Kpi label="Timeframe" value={timeframe === "all" ? 999 : 7} suffix={timeframe === "all" ? "+ days" : " days"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title="Themes" items={stats.topThemes} tone="indigo" />
        <Section title="Positives" items={stats.topPositives} tone="green" />
        <Section title="Negatives" items={stats.topNegatives} tone="red" />
        <Section title="Pain Points" items={stats.topPain} tone="amber" />
      </div>
    </div>
  );
}

function Header({
  title,
  subtitle,
  timeframe,
  setTimeframe,
}: {
  title: string;
  subtitle: string;
  timeframe: "all" | "week";
  setTimeframe: (x: "all" | "week") => void;
}) {
  return (
    <div className="bg-white p-7 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold text-black">{title}</h1>
        <p className="text-sm text-gray-600 mt-2">{subtitle}</p>
      </div>

      <div className="flex bg-gray-50 rounded-xl p-1 border">
        <button
          onClick={() => setTimeframe("all")}
          className={`px-4 py-2 rounded-lg font-semibold transition-all ${
            timeframe === "all" ? "bg-indigo-600 text-white shadow-md" : "text-gray-700 hover:bg-white"
          }`}
        >
          All Time
        </button>
        <button
          onClick={() => setTimeframe("week")}
          className={`px-4 py-2 rounded-lg font-semibold transition-all ${
            timeframe === "week" ? "bg-indigo-600 text-white shadow-md" : "text-gray-700 hover:bg-white"
          }`}
        >
          Last 7 Days
        </button>
      </div>
    </div>
  );
}

function Kpi({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
      <div className="text-sm text-gray-500 font-medium uppercase tracking-wider">{label}</div>
      <div className="text-4xl font-extrabold text-black mt-1">
        {value}
        {suffix ? <span className="text-lg font-bold text-gray-400 ml-2">{suffix}</span> : null}
      </div>
    </div>
  );
}

function Section({
  title,
  items,
  tone,
}: {
  title: string;
  items: readonly (readonly [string, number])[];
  tone: "indigo" | "green" | "red" | "amber";
}) {
  const containerStyles =
    tone === "green"
      ? "bg-green-50 border-green-200"
      : tone === "red"
      ? "bg-red-50 border-red-200"
      : tone === "amber"
      ? "bg-amber-50 border-amber-200"
      : "bg-indigo-50 border-indigo-200";

  return (
    <div className={`p-6 rounded-2xl border-2 ${containerStyles}`}>
      <div className="text-lg font-bold text-black border-b border-black/5 pb-2 mb-4">{title}</div>
      <div className="flex flex-wrap gap-2">
        {items.length ? (
          items.map(([name, count]) => (
            <span key={name} className="px-3 py-1.5 rounded-full text-sm font-bold bg-white border border-gray-200 text-black shadow-sm">
              {name} <span className="text-indigo-600 ml-1">· {count}</span>
            </span>
          ))
        ) : (
          <span className="text-gray-400 italic">No data yet.</span>
        )}
      </div>
    </div>
  );
}

function topN(map: Record<string, number>, n: number) {
  return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, n) as Array<[string, number]>;
}
