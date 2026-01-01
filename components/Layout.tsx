// src/components/Layout.tsx - CLEAN VERSION
import React from "react";

type Tab =
  | "dashboard"
  | "inbox"
  | "add"
  | "list"
  | "customer_insights"
  | "agent_insights"
  | "products";

export default function Layout(props: {
  activeTab: Tab;
  setActiveTab: (t: Tab) => void;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const { activeTab, setActiveTab, onLogout, children } = props;

  const nav = [
    { id: "dashboard" as const, label: "Dashboard", icon: "📊" },
    { id: "inbox" as const, label: "Inbox", icon: "📬" },
    { id: "add" as const, label: "Add Ticket", icon: "➕" },
    { id: "list" as const, label: "Tickets", icon: "📋" },
    { id: "customer_insights" as const, label: "Customer Insights", icon: "👥" },
    { id: "agent_insights" as const, label: "Agent Insights", icon: "🎯" },
    { id: "products" as const, label: "Product Insights", icon: "📦" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 text-gray-900 font-sans">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              GD Customer Support Analyzer
            </h1>
          </div>

          <button
            onClick={onLogout}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-white border border-gray-200 shadow-sm hover:bg-gray-50 hover:shadow transition-all"
          >
            🚪 Logout
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          <aside className="md:col-span-3 lg:col-span-2">
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-3 sticky top-6">
              <div className="text-xs font-bold text-gray-400 px-2 pb-3 tracking-wider">NAVIGATION</div>

              <div className="space-y-1">
                {nav.map((item) => {
                  const active = item.id === activeTab;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      className={[
                        "w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2",
                        active
                          ? "bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-md scale-105"
                          : "text-gray-700 hover:bg-gray-100 hover:scale-102",
                      ].join(" ")}
                    >
                      <span className="text-base">{item.icon}</span>
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          <main className="md:col-span-9 lg:col-span-10">
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 sm:p-6">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
