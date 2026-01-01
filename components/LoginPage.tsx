// src/components/LoginPage.tsx
import React, { useMemo, useState } from "react";

type Props = {
  onSuccess: () => void;
};

const USERNAME = "mike mansour";
const PASSWORD = "TAmem191@";

export default function LoginPage({ onSuccess }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return Boolean(username.trim() && password);
  }, [username, password]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const u = username.trim().toLowerCase();
    const p = password;

    if (u === USERNAME && p === PASSWORD) {
      if (remember) {
        localStorage.setItem("support_intel_auth", "1");
      } else {
        sessionStorage.setItem("support_intel_auth", "1");
      }
      onSuccess();
      return;
    }

    setError("Invalid username or password.");
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden">
          <div className="p-8 bg-gradient-to-b from-gray-50 to-white border-b">
            <div className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
              Support Intel
            </div>
            <h1 className="text-3xl font-extrabold text-gray-900 mt-2">
              Sign in
            </h1>
            <p className="text-sm text-gray-600 mt-2">
              Enter your credentials to access tickets, customer insights, and agent insights.
            </p>
          </div>

          <form onSubmit={handleLogin} className="p-8 space-y-5">
            <div>
              <label className="block text-sm font-bold text-gray-700">
                Username
              </label>
              <input
                className="mt-2 w-full p-3 rounded-2xl border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-black font-medium"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g., mike mansour"
                autoComplete="username"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700">
                Password
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  type={show ? "text" : "password"}
                  className="flex-1 p-3 rounded-2xl border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-black font-medium"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="px-4 rounded-2xl border border-gray-200 bg-gray-50 hover:bg-gray-100 font-bold text-gray-800"
                  title={show ? "Hide password" : "Show password"}
                >
                  {show ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-gray-700 font-semibold">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4"
                />
                Remember me
              </label>
              <div className="text-xs text-gray-400">
                (Local/session storage)
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-semibold">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:text-gray-600 text-white font-extrabold transition"
            >
              Sign in
            </button>

            <div className="text-xs text-gray-500 leading-relaxed">
              Tip: Once signed in, your shared data will load automatically (if remote storage is configured).
            </div>
          </form>
        </div>

        <div className="text-center text-xs text-white/40 mt-4">
          Built for fast support intelligence ✨
        </div>
      </div>
    </div>
  );
}
