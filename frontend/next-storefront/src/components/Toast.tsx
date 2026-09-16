"use client";

import { useState, useEffect } from "react";

interface ToastMsg {
  id: number;
  text: string;
  type: "error" | "success" | "info";
}

let toastId = 0;
const listeners = new Set<(toasts: ToastMsg[]) => void>();
let toasts: ToastMsg[] = [];

function notify() {
  listeners.forEach((l) => l([...toasts]));
}

export function showToast(text: string, type: ToastMsg["type"] = "info") {
  const id = ++toastId;
  toasts = [...toasts.slice(-1), { id, text, type }];
  notify();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    notify();
  }, 3000);
}

export default function ToastContainer() {
  const [items, setItems] = useState<ToastMsg[]>([]);

  useEffect(() => {
    listeners.add(setItems);
    return () => { listeners.delete(setItems); };
  }, []);

  if (items.length === 0) return null;

  return (
    <div id="toast-container">
      {items.map((t) => (
        <div key={t.id} className={`toast toast-item toast-${t.type}`}>
          {t.type === "success" && <i className="fa-solid fa-circle-check" style={{ color: "var(--accent, #e63946)", fontSize: "14px" }} />}
          {t.type === "error" && <i className="fa-solid fa-circle-exclamation" style={{ color: "#ef4444", fontSize: "14px" }} />}
          {t.type === "info" && <i className="fa-solid fa-circle-info" style={{ color: "#38bdf8", fontSize: "14px" }} />}
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}
