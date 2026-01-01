import React, { useMemo } from "react";
import { SupportTicket } from "../types.ts";

interface DashboardProps {
  tickets: SupportTicket[];
}

const Dashboard: React.FC<DashboardProps> = ({ tickets }) => {
  const stats = useMemo(() => {
    const totalTickets = tickets.length;
    const openTickets = tickets.filter((t) => 
      t.status !== "Closed" && t.status !== "Resolved"
    ).length;
    const totalMessages = tickets.reduce((acc, t) => acc + t.messages.length, 0);
    const criticalTickets = tickets.filter(t => t.severity === "Critical").length;
    const urgentTickets = tickets.filter(t => t.severity === "Urgent").length;

    const rootCauseCounts: Record<string, number> = {};
    tickets.forEach((t) => {
      rootCauseCounts[t.rootCausePrimary] = (rootCauseCounts[t.rootCausePrimary] || 0) + 1;
    });

    const topRootCauses = Object.entries(rootCauseCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    const statusCounts: Record<string, number> = {};
    tickets.forEach(t => {
      statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
    });

    const severityCounts = {
      Critical: criticalTickets,
      Urgent: urgentTickets,
      Normal: totalTickets - criticalTickets - urgentTickets,
    };

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const recentTickets = tickets.filter(
      t => new Date(t.lastActivityAt) >= weekAgo
    ).length;

    const replacementRequests = tickets.filter(t => t.replacementRequested).length;

    return { 
      totalTickets, 
      openTickets, 
      totalMessages, 
      topRootCauses,
      statusCounts,
      severityCounts,
      recentTickets,
      replacementRequests,
      criticalTickets,
      urgentTickets,
    };
  }, [tickets]);

  const handleExportData = () => {
    if (tickets.length === 0) {
      alert("No tickets to export");
      return;
    }

    const data = tickets.map(t => ({
      customer: t.customerName,
      email: t.customerEmail,
      status: t.status,
      severity: t.severity,
      rootCause: t.rootCausePrimary,
      created: new Date(t.createdAt).toLocaleDateString(),
      lastActivity: new Date(t.lastActivityAt).toLocaleDateString(),
      messages: t.messages.length,
      replacement: t.replacementRequested ? "Yes" : "No",
    }));

    const csv = [
      Object.keys(data[0]).join(','),
      ...data.map(row => Object.values(row).map(v => `"${v}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tickets-export-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 p-8 rounded-2xl shadow-lg text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-extrabold mb-2">Gear Doctors Customer Service</h1>
            <p className="text-indigo-100 text-lg">
              Real-time insights powered by AI • Last updated: {new Date().toLocaleTimeString()}
            </p>
          </div>
          <button
            onClick={handleExportData}
            className="px-6 py-3 bg-white text-indigo-600 rounded-xl font-bold hover:bg-indigo-50 transition shadow-lg flex items-center gap-2"
          >
            <span>📥</span>
            Export CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard 
          label="Total Tickets" 
          value={stats.totalTickets} 
          icon="📊"
          trend={`${stats.recentTickets} this week`}
        />
        <MetricCard 
          label="Open Tickets" 
          value={stats.openTickets} 
          icon="🔓"
          accent="text-amber-600"
          bgAccent="bg-amber-50"
        />
        <MetricCard 
          label="Critical Issues" 
          value={stats.criticalTickets} 
          icon="🔥"
          accent="text-red-600"
          bgAccent="bg-red-50"
        />
        <MetricCard 
          label="Replacements" 
          value={stats.replacementRequests} 
          icon="🔄"
          accent="text-purple-600"
          bgAccent="bg-purple-50"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            📈 Status Distribution
          </h3>
          <div className="space-y-3">
            {Object.entries(stats.statusCounts).map(([status, count]) => {
              const percentage = stats.totalTickets > 0 
                ? ((count / stats.totalTickets) * 100).toFixed(1) 
                : "0";
              return (
                <div key={status}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-semibold text-gray-700">{status}</span>
                    <span className="text-gray-600">{count} ({percentage}%)</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2.5">
                    <div 
                      className="bg-indigo-600 h-2.5 rounded-full transition-all duration-500"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            ⚡ Severity Breakdown
          </h3>
          <div className="space-y-4">
            <SeverityBar 
              label="Critical" 
              count={stats.severityCounts.Critical}
              total={stats.totalTickets}
              color="bg-red-500"
            />
            <SeverityBar 
              label="Urgent" 
              count={stats.severityCounts.Urgent}
              total={stats.totalTickets}
              color="bg-amber-500"
            />
            <SeverityBar 
              label="Normal" 
              count={stats.severityCounts.Normal}
              total={stats.totalTickets}
              color="bg-green-500"
            />
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            🎯 Top Root Causes
          </h3>
          <span className="text-sm text-gray-500">
            Based on {stats.totalTickets} tickets
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {stats.topRootCauses.length ? (
            stats.topRootCauses.map(([name, c]) => (
              <span
                key={name}
                className="group px-4 py-2 rounded-xl text-sm font-semibold border-2 bg-gray-900 text-white border-gray-900 hover:bg-white hover:text-gray-900 transition-all cursor-pointer"
              >
                {name} <span className="opacity-80 group-hover:opacity-100">· {c}</span>
              </span>
            ))
          ) : (
            <span className="text-gray-400 italic">No data yet.</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <QuickStat 
          label="Total Messages" 
          value={stats.totalMessages}
          subtext="Across all tickets"
        />
        <QuickStat 
          label="Avg Messages/Ticket" 
          value={stats.totalTickets > 0 ? (stats.totalMessages / stats.totalTickets).toFixed(1) : "0"}
          subtext="Conversation depth"
        />
        <QuickStat 
          label="Recent Activity" 
          value={stats.recentTickets}
          subtext="Last 7 days"
        />
      </div>
    </div>
  );
};

const MetricCard = ({
  label,
  value,
  icon,
  accent = "text-indigo-600",
  bgAccent = "bg-indigo-50",
  trend,
}: {
  label: string;
  value: number;
  icon: string;
  accent?: string;
  bgAccent?: string;
  trend?: string;
}) => (
  <div className={`${bgAccent} p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow`}>
    <div className="flex items-center justify-between mb-2">
      <p className="text-sm text-gray-600 font-medium uppercase tracking-wider">{label}</p>
      <span className="text-2xl">{icon}</span>
    </div>
    <h3 className={`text-4xl font-extrabold ${accent}`}>{value}</h3>
    {trend && (
      <p className="text-xs text-gray-500 mt-2">{trend}</p>
    )}
  </div>
);

const SeverityBar = ({ 
  label, 
  count, 
  total,
  color 
}: { 
  label: string; 
  count: number; 
  total: number;
  color: string;
}) => {
  const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : "0";
  return (
    <div>
      <div className="flex justify-between text-sm mb-1.5">
        <span className="font-bold text-gray-800">{label}</span>
        <span className="text-gray-600 font-semibold">{count} ({percentage}%)</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-3">
        <div 
          className={`${color} h-3 rounded-full transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

const QuickStat = ({ label, value, subtext }: { label: string; value: string | number; subtext: string }) => (
  <div className="bg-gray-50 border border-gray-200 p-4 rounded-xl">
    <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">{label}</p>
    <p className="text-2xl font-extrabold text-gray-900 mt-1">{value}</p>
    <p className="text-xs text-gray-500 mt-1">{subtext}</p>
  </div>
);

export default Dashboard;
