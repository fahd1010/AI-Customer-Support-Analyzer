
import React, { useMemo } from "react";
import { SupportTicket, PRODUCTS, TAGS } from "../types.ts";

export default function ProductInsights({ tickets }: { tickets: SupportTicket[] }) {
  const productData = useMemo(() => {
    return PRODUCTS.map((product) => {
      // Find all tickets for this specific product
      const productTickets = tickets.filter((t) => {
        // Check if ticket or any message in ticket has this productId
        return t.messages.some(m => m.productId === product.id);
      });

      const positiveCounts: Record<string, number> = {};
      const negativeCounts: Record<string, number> = {};

      productTickets.forEach((t) => {
        t.messages.forEach((m) => {
          // Only count if message is actually associated with this product
          if (m.productId === product.id) {
            (m.customerAnalysis.positiveTags || []).forEach((tag) => {
              positiveCounts[tag] = (positiveCounts[tag] || 0) + 1;
            });
            (m.customerAnalysis.negativeTags || []).forEach((tag) => {
              negativeCounts[tag] = (negativeCounts[tag] || 0) + 1;
            });
          }
        });
      });

      return {
        ...product,
        ticketCount: productTickets.length,
        topPositives: Object.entries(positiveCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5),
        topNegatives: Object.entries(negativeCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5),
      };
    });
  }, [tickets]);

  return (
    <div className="space-y-8">
      <div className="bg-white p-7 rounded-2xl shadow-sm border border-gray-100">
        <h1 className="text-3xl font-extrabold text-black">📦 Product Model Analytics</h1>
        <p className="text-sm text-gray-600 mt-2">
          Tracking customer feedback frequency per product model to drive quality improvements.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {productData.map((p) => (
          <div key={p.id} className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden flex flex-col md:flex-row">
            {/* Sidebar info */}
            <div className="bg-gray-950 p-6 md:w-64 flex-shrink-0 flex flex-col justify-center items-center text-center">
              <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center text-3xl mb-4">
                {p.id === 'pillow' ? '😴' : '⛺'}
              </div>
              <h2 className="text-xl font-black text-white">{p.name}</h2>
              <div className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-full text-xs font-bold uppercase tracking-widest">
                {p.ticketCount} Tickets
              </div>
              <div className="mt-2 text-[10px] text-white/50 font-mono uppercase">
                {p.amazonId}
              </div>
            </div>

            {/* Content info */}
            <div className="p-6 flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Positive Frequency */}
              <div className="bg-green-50/50 p-5 rounded-xl border border-green-100">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xl">⭐</span>
                  <h3 className="text-sm font-bold text-green-900 uppercase tracking-wider">Top Positives</h3>
                </div>
                {p.topPositives.length > 0 ? (
                  <div className="space-y-3">
                    {p.topPositives.map(([tag, count]) => (
                      <div key={tag}>
                        <div className="flex justify-between text-xs mb-1 font-semibold text-green-800">
                          <span>{TAGS.positiveName(tag)}</span>
                          <span>{count}</span>
                        </div>
                        <div className="w-full bg-green-200/50 rounded-full h-2 overflow-hidden">
                          <div 
                            className="bg-green-500 h-full" 
                            style={{ width: `${Math.min(100, (count / p.ticketCount) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-green-600 italic">No positive feedback recorded yet.</p>
                )}
              </div>

              {/* Negative Frequency */}
              <div className="bg-red-50/50 p-5 rounded-xl border border-red-100">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xl">⚠️</span>
                  <h3 className="text-sm font-bold text-red-900 uppercase tracking-wider">Top Issues</h3>
                </div>
                {p.topNegatives.length > 0 ? (
                  <div className="space-y-3">
                    {p.topNegatives.map(([tag, count]) => (
                      <div key={tag}>
                        <div className="flex justify-between text-xs mb-1 font-semibold text-red-800">
                          <span>{TAGS.negativeName(tag)}</span>
                          <span>{count}</span>
                        </div>
                        <div className="w-full bg-red-200/50 rounded-full h-2 overflow-hidden">
                          <div 
                            className="bg-red-500 h-full" 
                            style={{ width: `${Math.min(100, (count / p.ticketCount) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-red-600 italic">No issues recorded yet.</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
