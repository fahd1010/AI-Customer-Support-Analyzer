// src/components/Toast.tsx
import React from "react";

type ToastType = "success" | "error" | "info" | "warning";

interface ToastProps {
  type: ToastType;
  message: string;
  onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ type, message, onClose }) => {
  const styles: Record<ToastType, string> = {
    success: "bg-green-50 border-green-500 text-green-900",
    error: "bg-red-50 border-red-500 text-red-900",
    info: "bg-blue-50 border-blue-500 text-blue-900",
    warning: "bg-amber-50 border-amber-500 text-amber-900",
  };

  const icons: Record<ToastType, string> = {
    success: "✅",
    error: "❌",
    info: "ℹ️",
    warning: "⚠️",
  };

  return (
    <div
      className={`${styles[type]} border-l-4 px-4 py-3 rounded-lg shadow-lg min-w-[320px] max-w-md animate-slide-in-right flex items-start gap-3`}
    >
      <span className="text-xl">{icons[type]}</span>
      <div className="flex-1">
        <p className="font-semibold text-sm">{message}</p>
      </div>
      <button
        onClick={onClose}
        className="text-gray-400 hover:text-gray-600 font-bold text-lg leading-none"
      >
        ×
      </button>
    </div>
  );
};

export default Toast;