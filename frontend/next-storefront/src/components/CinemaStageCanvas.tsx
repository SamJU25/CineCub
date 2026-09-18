"use client";

import { useEffect, useRef } from "react";

export function CinemaStageCanvas({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let animId: number;
    let width = (canvas.width = canvas.offsetWidth || 1200);
    let height = (canvas.height = canvas.offsetHeight || 600);
    let cachedRect = canvas.getBoundingClientRect();

    const updateDimensions = () => {
      if (!canvas) return;
      width = canvas.width = canvas.offsetWidth || 1200;
      height = canvas.height = canvas.offsetHeight || 600;
      cachedRect = canvas.getBoundingClientRect();
    };
    window.addEventListener("resize", updateDimensions, { passive: true });

    // Subtle cinematic golden and amethyst particles
    const PARTICLE_COUNT = 24;
    const particles = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: Math.random() * 1.6 + 0.6,
      vx: (Math.random() - 0.5) * 0.22,
      vy: -Math.random() * 0.3 - 0.08,
      alpha: Math.random() * 0.35 + 0.15,
      color: Math.random() > 0.4 ? "255, 183, 3" : "199, 125, 255",
    }));

    let isDocumentVisible = !document.hidden;
    let isIntersecting = true;

    const onVisibility = () => {
      isDocumentVisible = !document.hidden;
    };
    document.addEventListener("visibilitychange", onVisibility);

    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries[0]) {
            isIntersecting = entries[0].isIntersecting;
            if (isIntersecting) {
              cachedRect = canvas.getBoundingClientRect();
            }
          }
        },
        { threshold: 0.05 }
      );
      observer.observe(canvas);
    }

    // Interactive pointer proximity (cached rect prevents layout thrashing)
    let pointerX = -9999;
    let pointerY = -9999;
    let targetScrollImpulse = 0;
    let currentScrollImpulse = 0;
    let lastScrollY = typeof window !== "undefined" ? window.scrollY : 0;

    const onPointerMove = (e: PointerEvent) => {
      pointerX = e.clientX - cachedRect.left;
      pointerY = e.clientY - cachedRect.top;
    };
    const onPointerLeave = () => {
      pointerX = -9999;
      pointerY = -9999;
    };
    const onScroll = () => {
      const curY = window.scrollY;
      const dy = curY - lastScrollY;
      lastScrollY = curY;
      targetScrollImpulse = Math.min(Math.max(dy * 0.04, -2), 2);
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });

    const render = () => {
      // Pause completely when hidden or scrolled out of view
      if (!isDocumentVisible || !isIntersecting) {
        animId = requestAnimationFrame(render);
        return;
      }

      ctx.clearRect(0, 0, width, height);
      currentScrollImpulse += (targetScrollImpulse - currentScrollImpulse) * 0.08;
      targetScrollImpulse *= 0.92;

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const p = particles[i];
        // Pointer avoidance / gentle air turbulence
        const dx = p.x - pointerX;
        const dy = p.y - pointerY;
        const distSq = dx * dx + dy * dy;
        if (distSq < 16000 && distSq > 1) {
          const dist = Math.sqrt(distSq);
          const force = (1 - dist / 126) * 0.45;
          p.x += (dx / dist) * force;
          p.y += (dy / dist) * force;
        }

        p.x += p.vx;
        p.y += p.vy - currentScrollImpulse;

        if (p.y < -10) {
          p.y = height + 10;
          p.x = Math.random() * width;
        }
        if (p.y > height + 10) {
          p.y = -10;
          p.x = Math.random() * width;
        }
        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;

        // High performance glowing ember without expensive ctx.shadowBlur
        // 1. Soft halo
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 2.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.color}, ${p.alpha * 0.28})`;
        ctx.fill();

        // 2. Core bright ember
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.color}, ${p.alpha})`;
        ctx.fill();
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      observer?.disconnect();
      window.removeEventListener("resize", updateDimensions);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 3,
        opacity: 0.65,
      }}
      aria-hidden="true"
    />
  );
}

export default CinemaStageCanvas;
