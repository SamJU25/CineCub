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

  // Head tracking (mouse & fine pointers) + idle doze-off
  useEffect(() => {
    let sector = -1;
    let pointer: { x: number; y: number } | null = null;
    let cachedBox: DOMRect | null = null;
    let rafId: number | null = null;
    const deadZone = Math.max(18, Math.min(32, size * 0.45));

    const updateBox = () => {
      if (buttonRef.current) {
        cachedBox = buttonRef.current.getBoundingClientRect();
      }
    };

    const aim = () => {
      rafId = null;
      const button = buttonRef.current;
      if (!button || !pointer) return;
      if (!cachedBox) {
        cachedBox = button.getBoundingClientRect();
      }
      const box = cachedBox;
      const dx = pointer.x - (box.left + box.width / 2);
      const dy = pointer.y - (box.top + box.height / 2);
      if (Math.hypot(dx, dy) < deadZone) {
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

    const scheduleAim = () => {
      if (rafId === null) {
        rafId = window.requestAnimationFrame(aim);
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      pointer = { x: event.clientX, y: event.clientY };
      wake();
      armIdleTimer();
      scheduleAim();
    };

    const onScrollOrResize = () => {
      updateBox();
      scheduleAim();
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize, { passive: true });
    armIdleTimer();

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [armIdleTimer, size, wake]);

  // Mobile & touch: scroll-direction gaze (looks where the user scrolls)
  useEffect(() => {
    let scrollTimeout: ReturnType<typeof setTimeout> | undefined;
    let lastScrollY = typeof window !== "undefined" ? window.scrollY : 0;
    const isTouch = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

    const onScroll = () => {
      wake();
      armIdleTimer();

      if (!isTouch || asleepRef.current) return;

      const currentScrollY = window.scrollY;
      const delta = currentScrollY - lastScrollY;
      lastScrollY = currentScrollY;

      if (Math.abs(delta) > 4) {
        setDirection(delta > 0 ? "down" : "up");
        if (scrollTimeout) clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          setDirection("center");
        }, 600);
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (scrollTimeout) clearTimeout(scrollTimeout);
    };
  }, [armIdleTimer, wake]);

  // Autonomous ambient life (subtle natural blinks & glances when idle)
  useEffect(() => {
    let ambientTimer: ReturnType<typeof setTimeout> | undefined;

    const tick = () => {
      if (document.hidden || asleepRef.current) {
        ambientTimer = setTimeout(tick, 3000);
        return;
      }

      // Only perform ambient animation if no active reaction
      setReaction((curReaction) => {
        if (curReaction === null) {
          const rand = Math.random();
          if (rand < 0.65) {
            // Quick natural blink
            timersRef.current.push(setTimeout(() => setReaction(null), 160));
            return "blink";
          } else if (rand < 0.82) {
            // Gentle glance left
            setDirection("left");
            timersRef.current.push(setTimeout(() => setDirection("center"), 1000));
          } else {
            // Gentle glance right
            setDirection("right");
            timersRef.current.push(setTimeout(() => setDirection("center"), 1000));
          }
        }
        return curReaction;
      });

      const nextInterval = 4500 + Math.random() * 5500;
      ambientTimer = setTimeout(tick, nextInterval);
    };

    ambientTimer = setTimeout(tick, 4000);

    const onVisibilityChange = () => {
      if (!document.hidden) {
        armIdleTimer();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      if (ambientTimer) clearTimeout(ambientTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [armIdleTimer]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  const boop = (e?: React.MouseEvent | React.TouchEvent) => {
    e?.stopPropagation();

    const now = Date.now();
    const boops = boopsRef.current;
    const isDizzy = now - boops.at < DIZZY_WINDOW && boops.count + 1 >= DIZZY_AFTER;

    // Mobile haptic feedback on supported touch devices
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      try {
        if (isDizzy) {
          navigator.vibrate([24, 40, 24]);
        } else {
          navigator.vibrate(12);
        }
      } catch {}
    }

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
      className={`mascot-btn ${className || ""}`.trim()}
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
        touchAction: "manipulation",
        WebkitTapHighlightColor: "transparent",
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
