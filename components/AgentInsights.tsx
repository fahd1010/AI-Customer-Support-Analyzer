import React, { useMemo, useState } from "react";
import { SupportTicket, TAGS } from "../types";

type Timeframe = "all" | "week";

export default function AgentInsights({ tickets }: { tickets: SupportTicket[] }) {
  const [timeframe, setTimeframe] = useState<Timeframe>("week");

  const messageScope = useMemo(() => {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const all = tickets.flatMap((t) => t.messages);
    const filtered = timeframe === "all" ? all : all.filter((m) => new Date(m.createdAt) >= weekAgo);
    return filtered.filter((m) => !!m.agentAnalysis);
  }, [tickets, timeframe]);

  const stats = useMemo(() => {
    const strengthCounts: Record<string, number> = {};
    const weaknessCounts: Record<string, number> = {};
    const focusCounts: Record<string, number> = {};

    let scored = 0;
    let scoreSum = 0;

    messageScope.forEach((m) => {
      const a = m.agentAnalysis!;
      (a.strengthTags || []).forEach((id) => (strengthCounts[id] = (strengthCounts[id] || 0) + 1));
      (a.weaknessTags || []).forEach((id) => (weaknessCounts[id] = (weaknessCounts[id] || 0) + 1));
      (a.focusAreas || []).forEach((x) => {
        const k = x.trim().toLowerCase();
        if (!k) return;
        focusCounts[k] = (focusCounts[k] || 0) + 1;
      });

      if (Number.isFinite(a.overallQualityScore) && a.overallQualityScore > 0) {
        scored += 1;
        scoreSum += a.overallQualityScore;
      }
    });

    const avg = scored ? scoreSum / scored : 0;

    return {
      repliesInScope: messageScope.length,
      avgScore: avg,
      topStrengths: topN(strengthCounts, 12).map(([id, c]) => [TAGS.agentStrengthName(id), c] as const),
      topWeaknesses: topN(weaknessCounts, 12).map(([id, c]) => [TAGS.agentWeaknessName(id), c] as const),
      topFocusAreas: topN(focusCounts, 10).map(([id, c]) => [id, c] as const),
    };
  }, [messageScope]);

  // Performance Trends (last 30 days)
  const performanceTrends = useMemo(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const allMessages = tickets
      .flatMap((t) => t.messages)
      .filter((m) => m.agentAnalysis && new Date(m.createdAt) >= thirtyDaysAgo)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    // Group by week
    const weeklyData: { week: string; avgScore: number; count: number }[] = [];
    const weekMap = new Map<string, { sum: number; count: number }>();

    allMessages.forEach((m) => {
      const date = new Date(m.createdAt);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay()); // Start of week
      const weekKey = weekStart.toISOString().split("T")[0];

      const score = m.agentAnalysis?.overallQualityScore || 0;
      if (score > 0) {
        const existing = weekMap.get(weekKey) || { sum: 0, count: 0 };
        weekMap.set(weekKey, { sum: existing.sum + score, count: existing.count + 1 });
      }
    });

    weekMap.forEach((value, week) => {
      weeklyData.push({
        week: new Date(week).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        avgScore: value.sum / value.count,
        count: value.count,
      });
    });

    return weeklyData;
  }, [tickets]);

  return (
    <div className="space-y-6">
      <Header
        title="Agent Insights"
        subtitle="Frequencies computed only from YOUR replies (strengths / weaknesses / focus areas)."
        timeframe={timeframe}
        setTimeframe={setTimeframe}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Kpi label="Replies analyzed" value={stats.repliesInScope} />
        <Kpi label="Average reply score" value={Number(stats.avgScore.toFixed(1))} />
        <Kpi label="Performance Scale" value={10} suffix="max" />
      </div>

      {/* Performance Trends Chart */}
      {performanceTrends.length > 0 && (
        <div className="bg-white p-7 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-xl font-bold text-black">📈 Performance Trends</h3>
              <p className="text-sm text-gray-600 mt-1">Your reply quality over the last 30 days</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-extrabold text-indigo-600">
                {performanceTrends[performanceTrends.length - 1]?.avgScore.toFixed(1) || "N/A"}
              </div>
              <div className="text-xs text-gray-500">Latest Week</div>
            </div>
          </div>

          <div className="relative h-64">
            <div className="absolute inset-0 flex items-end justify-between gap-2">
              {performanceTrends.map((data, idx) => {
                const height = (data.avgScore / 10) * 100;
                const isLatest = idx === performanceTrends.length - 1;
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-2">
                    <div className="w-full relative group">
                      <div
                        className={`w-full rounded-t-lg transition-all duration-300 ${
                          isLatest ? "bg-indigo-600" : "bg-indigo-400"
                        } hover:bg-indigo-700`}
                        style={{ height: `${height}%` }}
                      >
                        <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                          Score: {data.avgScore.toFixed(1)} ({data.count} replies)
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-gray-600 font-semibold transform -rotate-45 origin-top-left mt-2">
                      {data.week}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-8 flex items-center justify-center gap-4 text-xs text-gray-500">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-indigo-400 rounded"></div>
              <span>Previous Weeks</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-indigo-600 rounded"></div>
              <span>Latest Week</span>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title="Your Strengths (Frequency)" items={stats.topStrengths} tone="green" />
        <Section title="Your Weaknesses (Frequency)" items={stats.topWeaknesses} tone="red" />
      </div>

      <div className="bg-white p-7 rounded-2xl border border-gray-100 shadow-sm">
        <div className="text-xl font-bold text-black">Most Common Focus Areas</div>
        <div className="text-sm text-gray-600 mt-1">Prioritize improving these specific interaction points.</div>

        <div className="mt-6 flex flex-wrap gap-2">
          {stats.topFocusAreas.length ? (
            stats.topFocusAreas.map(([name, c]) => (
              <span key={name} className="px-4 py-2 rounded-xl text-sm font-bold bg-gray-50 border border-gray-200 text-black shadow-sm">
                {name} <span className="text-indigo-600 ml-1">· {c}</span>
              </span>
            ))
          ) : (
            <span className="text-gray-400 italic">No focus areas yet.</span>
          )}
        </div>
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
            timeframe === "all" ? "bg-gray-900 text-white shadow-md" : "text-gray-700 hover:bg-white"
          }`}
        >
          All Time
        </button>
        <button
          onClick={() => setTimeframe("week")}
          className={`px-4 py-2 rounded-lg font-semibold transition-all ${
            timeframe === "week" ? "bg-gray-900 text-white shadow-md" : "text-gray-700 hover:bg-white"
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
  tone: "green" | "red";
}) {
  const containerStyles = tone === "green" ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200";
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

export interface AgentReplyAnalysis {
  overallQualityScore: number;
  summary: string;
  strengthTags: string[];
  weaknessTags: string[];
  focusAreas: string[];
}

