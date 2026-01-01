import React, { useMemo, useState } from "react";
import { PRODUCTS, SupportTicket } from "../types";

interface AddIssueProps {
  tickets: SupportTicket[];
  onAnalyzeAndSave: (payload: {
    customerName: string;
    customerEmail: string;
    orderId?: string;
    productId?: string;
    productName?: string;
    productAmazonId?: string;
    chatConversation: string;
  }) => Promise<void>;
  showToast: (type: "success" | "error" | "info" | "warning", message: string) => void;
}

const AddIssue: React.FC<AddIssueProps> = ({ tickets, onAnalyzeAndSave, showToast }) => {
  const [form, setForm] = useState({
    name: "",
    email: "",
    orderId: "",
    productId: "",
    chatConversation: "",
  });

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const selectedProduct = useMemo(() => {
    return PRODUCTS.find((p) => p.id === form.productId) || null;
  }, [form.productId]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!form.name.trim()) {
      newErrors.name = "Customer name is required";
    }

    if (!form.email.trim()) {
      newErrors.email = "Customer email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = "Invalid email format";
    }

    if (!form.chatConversation.trim()) {
      newErrors.chatConversation = "Chat conversation is required";
    } else if (form.chatConversation.trim().length < 20) {
      newErrors.chatConversation = "Conversation too short (min 20 characters)";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      showToast("error", "Please fix the form errors");
      return;
    }

    setLoading(true);
    try {
      await onAnalyzeAndSave({
        customerName: form.name.trim(),
        customerEmail: form.email.trim(),
        orderId: form.orderId.trim(),
        productId: selectedProduct?.id || "",
        productName: selectedProduct?.name || "",
        productAmazonId: selectedProduct?.amazonId || "",
        chatConversation: form.chatConversation,
      });

      setForm({
        name: "",
        email: "",
        orderId: "",
        productId: "",
        chatConversation: "",
      });
      setErrors({});
    } catch (error) {
      // Error already handled in parent
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="bg-gradient-to-br from-indigo-50 to-white p-8 rounded-2xl shadow-sm border border-indigo-100">
        <div>
          <h2 className="text-3xl font-extrabold text-gray-900 mb-2">New Ticket Entry</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            Paste the full chat conversation. AI will auto-detect the product, analyze customer issues, and evaluate your reply quality.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">
                Customer Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                className={`w-full rounded-xl border ${
                  errors.name ? "border-red-500" : "border-gray-300"
                } shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 p-3 text-black font-medium`}
                value={form.name}
                onChange={(e) => {
                  setForm((s) => ({ ...s, name: e.target.value }));
                  if (errors.name) setErrors((e) => ({ ...e, name: "" }));
                }}
              />
              {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">
                Customer Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                required
                className={`w-full rounded-xl border ${
                  errors.email ? "border-red-500" : "border-gray-300"
                } shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 p-3 text-black font-medium`}
                value={form.email}
                onChange={(e) => {
                  setForm((s) => ({ ...s, email: e.target.value }));
                  if (errors.email) setErrors((e) => ({ ...e, email: "" }));
                }}
              />
              {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Order ID (optional)</label>
              <input
                type="text"
                className="w-full rounded-xl border-gray-300 shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 p-3 border text-black font-medium"
                value={form.orderId}
                onChange={(e) => setForm((s) => ({ ...s, orderId: e.target.value }))}
                placeholder="e.g., 113-XXXX..."
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">
                Product (optional - AI auto-detects)
              </label>
              <select
                className="w-full rounded-xl border-gray-300 shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 p-3 border bg-white text-black font-medium"
                value={form.productId}
                onChange={(e) => setForm((s) => ({ ...s, productId: e.target.value }))}
              >
                <option value="" className="text-gray-500">AI will detect from chat…</option>
                {PRODUCTS.map((p) => (
                  <option key={p.id} value={p.id} className="text-black">
                    {p.name}
                  </option>
                ))}
              </select>
              {selectedProduct && (
                <p className="text-xs text-gray-500 mt-1">
                  Amazon ID: <span className="font-mono">{selectedProduct.amazonId}</span>
                </p>
              )}
              {!selectedProduct && (
                <p className="text-xs text-indigo-600 mt-1">
                  💡 Leave empty - AI will detect product from conversation
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">
              Chat Conversation <span className="text-red-500">*</span>
            </label>
            <textarea
              required
              rows={12}
              placeholder="Paste the full chat conversation here (Arabic/English)…

Example format:
Customer: I have a problem with the Artemis 3D pillow
Agent: I'm sorry to hear that. What seems to be the issue?
Customer: It's leaking air overnight
Agent: Let me help you with that..."
              className={`w-full rounded-xl border ${
                errors.chatConversation ? "border-red-500" : "border-gray-300"
              } shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 p-3 text-black font-medium`}
              value={form.chatConversation}
              onChange={(e) => {
                setForm((s) => ({ ...s, chatConversation: e.target.value }));
                if (errors.chatConversation) setErrors((e) => ({ ...e, chatConversation: "" }));
              }}
            />
            {errors.chatConversation && <p className="text-xs text-red-600 mt-1">{errors.chatConversation}</p>}
            <p className="text-xs text-gray-500 mt-2">
              AI will: ✅ Detect product name ✅ Analyze customer issues ✅ Evaluate your reply quality
              <br />
              Character count: {form.chatConversation.length}
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-extrabold hover:bg-indigo-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg hover:shadow-xl"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                Analyzing Chat…
              </>
            ) : (
              <>
                ✨ Analyze Chat + Save Ticket
              </>
            )}
          </button>

          <div className="text-center">
            <div className="inline-flex items-center gap-2 text-xs text-gray-500 bg-gray-50 px-4 py-2 rounded-full">
              <span className="font-semibold">Current tickets stored:</span>
              <span className="font-bold text-indigo-600">{tickets.length}</span>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddIssue;
