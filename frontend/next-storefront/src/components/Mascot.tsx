"use client";

/**
 * Mascot — vendored + extended from `page-mascot` (MIT © Kamran Ahmed).
 *
 * Original behaviour: nine head directions follow the cursor, a click plays a
 * blink -> payoff reaction chain, and four rapid clicks make it dizzy.
 *
 * Extensions added here (upstream left these four expressions idle):
 *  - sleepy    when the pointer has been still for `idleMs`
 *  - surprised on the hover that wakes it back up
 *  - wink      on hover
 *  - bashful   rare easter egg instead of the wink
 */

import { useEffect, useRef, useState, useCallback } from "react";

export type MascotDirection =
  | "up-left" | "up" | "up-right"
  | "left" | "center" | "right"
  | "down-left" | "down" | "down-right";

export type MascotReaction =
  | "blink" | "heart" | "sparkle"
  | "surprised" | "wink" | "bashful"
  | "sleepy" | "dizzy" | "delighted";

const DIRECTIONS: MascotDirection[] = [
  "up-left", "up", "up-right",
  "left", "center", "right",
  "down-left", "down", "down-right",
];

const REACTIONS: MascotReaction[] = [
  "blink", "heart", "sparkle",
  "surprised", "wink", "bashful",
  "sleepy", "dizzy", "delighted",
];

/** Clockwise from the right, matching atan2 with y pointing down. */
const CLOCKWISE: MascotDirection[] = [
  "right", "down-right", "down", "down-left",
  "left", "up-left", "up", "up-right",
];
const SECTOR = (Math.PI * 2) / CLOCKWISE.length;
const HYSTERESIS = 0.12;
const DEAD_ZONE = 70;
const PAYOFFS: MascotReaction[] = ["heart", "sparkle", "delighted"];
const BOOP_PAYOFF = 120;
const BOOP_END = 560;
const SQUASH_MS = 420;
const DIZZY_AFTER = 4;
const DIZZY_WINDOW = 1600;
const DIZZY_END = 1100;
const WAKE_MS = 650;
const HOVER_MS = 800;
const BASHFUL_CHANCE = 0.25;

const SQUASH: Keyframe[] = [
  { transform: "scale(1, 1)", easing: "ease-in" },
  { transform: "scale(1.10, 0.86)", offset: 0.18, easing: "ease-out" },
  { transform: "scale(0.95, 1.08)", offset: 0.45, easing: "ease-in-out" },
  { transform: "scale(1.03, 0.97)", offset: 0.72, easing: "ease-in-out" },
  { transform: "scale(1, 1)" },
];

/** background-size 300% makes each cell a clean 0/50/100% step on both axes. */
function cell(index: number) {
  return {
    backgroundPosition: `${(index % 3) * 50}% ${Math.floor(index / 3) * 50}%`,
  };
}

function wrap(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

const layer: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  backgroundSize: "300% 300%",
  backgroundRepeat: "no-repeat",
  transition: "opacity 90ms linear",
};

export interface MascotProps {
  /** Path to the 3x3 head-direction sprite sheet. */
  directions: string;
  /** Path to the 3x3 expression sprite sheet. */
  reactions: string;
  /** Square size in px. */
  size?: number;
  /** What a screen reader calls it. */
  label?: string;
  className?: string;
  /** Pointer idle time before the mascot dozes off. `0` disables sleeping. */
  idleMs?: number;
  /** Enables the hover wink + rare bashful easter egg. */
  playful?: boolean;
}

export function Mascot({
  directions,
  reactions,
  size = 140,
  label = "mascot",
  className,
  idleMs = 45000,
  playful = true,
}: MascotProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const squashRef = useRef<HTMLSpanElement>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const boopsRef = useRef({ count: 0, at: 0 });
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const asleepRef = useRef(false);
  const [direction, setDirection] = useState<MascotDirection>("center");
  const [reaction, setReaction] = useState<MascotReaction | null>(null);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  /** Hold a reaction for a duration, then fall back to no reaction. */
  const show = useCallback(
    (name: MascotReaction, ms: number) => {
      clearTimers();
      setReaction(name);
      timersRef.current.push(setTimeout(() => setReaction(null), ms));
    },
    [clearTimers]
  );

  const sleep = useCallback(() => {
    asleepRef.current = true;
    clearTimers();
    setReaction("sleepy");
  }, [clearTimers]);

  const wake = useCallback(() => {
    if (!asleepRef.current) return;
    asleepRef.current = false;
    show("surprised", WAKE_MS);
  }, [show]);

  /** Restart the doze-off countdown on any pointer activity. */
  const armIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (!idleMs) return;
    idleTimerRef.current = setTimeout(sleep, idleMs);
  }, [idleMs, sleep]);

  // Head tracking (fine pointers only) + idle doze-off
  useEffect(() => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    let sector = -1;
    let pointer: { x: number; y: number } | null = null;

    const aim = () => {
      const button = buttonRef.current;
      if (!button || !pointer) return;
      const box = button.getBoundingClientRect();
      const dx = pointer.x - (box.left + box.width / 2);
      const dy = pointer.y - (box.top + box.height / 2);
      if (Math.hypot(dx, dy) < DEAD_ZONE) {
        sector = -1;
        setDirection("center");
        return;
      }
      // Hold the current sector until the pointer is well past its edge.
      const angle = Math.atan2(dy, dx);
      if (sector !== -1 && Math.abs(wrap(angle - sector * SECTOR)) < SECTOR / 2 + HYSTERESIS) {
        return;
      }
      sector = (Math.round(angle / SECTOR) + CLOCKWISE.length) % CLOCKWISE.length;
      setDirection(CLOCKWISE[sector]);
    };

    const onPointerMove = (event: PointerEvent) => {
      pointer = { x: event.clientX, y: event.clientY };
      wake();
      armIdleTimer();
      aim();
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    armIdleTimer();

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [armIdleTimer, wake]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  const boop = () => {
    const now = Date.now();
    const boops = boopsRef.current;
    const isDizzy = now - boops.at < DIZZY_WINDOW && boops.count + 1 >= DIZZY_AFTER;

    clearTimers();
    if (isDizzy) {
      boops.count = 0;
      setReaction("dizzy");
      timersRef.current.push(setTimeout(() => setReaction(null), DIZZY_END));
    } else {
      boops.count = now - boops.at < DIZZY_WINDOW ? boops.count + 1 : 1;
      const payoff = PAYOFFS[(boops.count - 1) % PAYOFFS.length];
      setReaction("blink");
      timersRef.current.push(setTimeout(() => setReaction(payoff), BOOP_PAYOFF));
      timersRef.current.push(setTimeout(() => setReaction(null), BOOP_END));
    }
    boops.at = now;
    asleepRef.current = false;
    armIdleTimer();

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Per-keyframe easing with the effect itself linear: an easing on the effect
    // would reinterpret every offset and front-load the whole bounce.
    squashRef.current?.animate(SQUASH, { duration: SQUASH_MS, easing: "linear" });
  };

  const onEnter = () => {
    if (asleepRef.current) {
      wake();
      armIdleTimer();
      return;
    }
    if (!playful) return;
    show(Math.random() < BASHFUL_CHANCE ? "bashful" : "wink", HOVER_MS);
  };

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={boop}
      onPointerEnter={onEnter}
      aria-label={`Boop the ${label}`}
      className={className}
      style={{
        position: "relative",
        display: "block",
        flexShrink: 0,
        width: size,
        height: size,
        padding: 0,
        border: 0,
        background: "transparent",
        appearance: "none",
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      <span
        ref={squashRef}
        style={{ position: "relative", display: "block", width: "100%", height: "100%", transformOrigin: "50% 78%" }}
      >
        <span
          style={{
            ...layer,
            backgroundImage: `url(${directions})`,
            ...cell(DIRECTIONS.indexOf(direction)),
            opacity: reaction ? 0 : 1,
          }}
        />
        <span
          style={{
            ...layer,
            backgroundImage: `url(${reactions})`,
            ...cell(REACTIONS.indexOf(reaction ?? "blink")),
            opacity: reaction ? 1 : 0,
          }}
        />
      </span>
    </button>
  );
}

export default Mascot;
