"use client";

import { useState, useEffect } from "react";

let startFn: () => void;
let doneFn: () => void;

export function startProgress() { startFn?.(); }
export function doneProgress() { doneFn?.(); }

export default function ProgressBar() {
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState("0%");

  useEffect(() => {
    startFn = () => {
      setVisible(true);
      setWidth("0%");
      requestAnimationFrame(() => setWidth("75%"));
    };
    doneFn = () => {
      setWidth("100%");
      setTimeout(() => {
        setVisible(false);
        setWidth("0%");
      }, 300);
    };
    return () => {
      startFn = () => {};
      doneFn = () => {};
    };
  }, []);

  if (!visible) return null;

  return (
    <div id="cv-progress">
      <div id="cv-progress-bar" style={{ width, transition: "width 300ms var(--ease-standard)" }} />
    </div>
  );
}
