"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useStore } from "@/lib/store";
import CinemaStageCanvas from "@/components/CinemaStageCanvas";
import type { MediaItem } from "@/lib/types";

export interface SpotlightItem {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  poster_path?: string;
  backdrop_path?: string;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
}

interface SpotlightCarouselProps {
  items?: (SpotlightItem | MediaItem)[];
}

export default function SpotlightCarousel({ items: initialItems }: SpotlightCarouselProps) {
  const [items, setItems] = useState<SpotlightItem[]>(() => {
    if (initialItems && initialItems.length > 0) {
      return (initialItems as SpotlightItem[])
        .filter((item) => item.backdrop_path && (item.title || item.name))
        .slice(0, 7);
    }
    return [];
  });
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [loading, setLoading] = useState(items.length === 0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const openPlayer = useStore((s) => s.openPlayer);
  const openDetail = useStore((s) => s.openDetail);

  // Sync if initialItems update from parent
  useEffect(() => {
    if (initialItems && initialItems.length > 0) {
      const valid = (initialItems as SpotlightItem[])
        .filter((item) => item.backdrop_path && (item.title || item.name))
        .slice(0, 7);
      if (valid.length > 0) {
        setItems(valid);
        setLoading(false);
      }
    }
  }, [initialItems]);

  const fetchSpotlight = useCallback(async () => {
    if (items.length > 0) return;
    try {
      const res = await fetch("/api/tmdb/trending/all/day?page=1");
      if (res.ok) {
        const data = await res.json();
        setItems(
          (data.results || [])
            .filter((item: SpotlightItem) => item.backdrop_path && (item.title || item.name))
            .slice(0, 7)
        );
      }
    } catch (e) {
      console.error("[SpotlightCarousel] failed to load spotlight:", e);
    } finally {
      setLoading(false);
    }
  }, [items.length]);

  const next = useCallback(() => {
    if (items.length > 0) {
      setActiveIndex((prev) => (prev + 1) % items.length);
    }
  }, [items.length]);

  const prev = useCallback(() => {
    if (items.length > 0) {
      setActiveIndex((prev) => (prev - 1 + items.length) % items.length);
    }
  }, [items.length]);

  function playCurrent() {
    const currentItem = items[activeIndex];
    if (!currentItem) return;
    const isMovie = currentItem.media_type === "movie" || Boolean(currentItem.title);
    const title = currentItem.title || currentItem.name || "Untitled";
    const poster = (currentItem.poster_path || currentItem.backdrop_path) ?? undefined;
    openPlayer(currentItem.id, isMovie ? "movie" : "tv", title, undefined, undefined, poster);
  }

  useEffect(() => {
    if (items.length === 0) {
      fetchSpotlight();
    }
  }, [fetchSpotlight, items.length]);

  // Slide auto-advance timer
  useEffect(() => {
    if (isPaused || items.length <= 1) return;
    intervalRef.current = setInterval(() => {
      next();
    }, 6000);
    return () => clearInterval(intervalRef.current);
  }, [isPaused, items.length, next, activeIndex]);

  if (loading && items.length === 0) {
    return (
      <div className="relative w-full rounded-[24px] overflow-hidden mb-8 border border-[rgba(255,255,255,0.08)] shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
        <div className="aspect-[21/9] min-h-[340px] bg-[#101018] flex items-center justify-center">
          <span className="w-10 h-10 border-[3px] border-[rgba(255,255,255,0.12)] border-t-white rounded-full animate-[spin_0.7s_linear_infinite]" />
        </div>
      </div>
    );
  }

  if (items.length === 0) return null;

  const currentItem = items[activeIndex] || items[0];
  const title = currentItem.title || currentItem.name || "Featured Title";
  const year = (currentItem.release_date || currentItem.first_air_date || "").slice(0, 4);
  const rating = typeof currentItem.vote_average === "number" && currentItem.vote_average > 0 ? currentItem.vote_average.toFixed(1) : "—";
  const isMovie = currentItem.media_type === "movie" || Boolean(currentItem.title);

  return (
    <div
      className="relative w-full rounded-[24px] overflow-hidden mb-9 border border-[rgba(255,255,255,0.1)] shadow-[0_24px_60px_-12px_rgba(0,0,0,0.7),0_0_40px_rgba(157,78,221,0.15)] group"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      role="region"
      aria-label="Featured Spotlight Carousel"
    >
      <div className="relative aspect-[21/9] min-h-[360px] md:min-h-[420px] flex items-end overflow-hidden">
        {/* Layered Crossfading Backdrops with Ken Burns Micro-Drift */}
        {items.map((item, idx) => {
          const isCur = idx === activeIndex;
          const backdrop = item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : "";
          return (
            <div
              key={item.id}
              className={`absolute inset-0 bg-cover bg-center transition-all duration-700 ease-out ${
                isCur ? "opacity-100 scale-100 z-[1]" : "opacity-0 scale-[1.03] pointer-events-none z-0"
              }`}
              style={{
                backgroundImage: `url('${backdrop}')`,
                backgroundPosition: "center 22%",
              }}
              aria-hidden={!isCur}
            />
          );
        })}

        {/* Cinematic Multi-Gradient Shroud (Dark Neo-Lacquer Base) */}
        <div className="absolute inset-0 z-[2] pointer-events-none bg-[linear-gradient(180deg,rgba(8,8,15,0.15)_0%,rgba(8,8,15,0.55)_45%,rgba(8,8,15,0.98)_100%),linear-gradient(90deg,rgba(8,8,15,0.96)_0%,rgba(8,8,15,0.72)_42%,transparent_82%)]" />

        {/* Ambient GPU Cinema Canvas */}
        <CinemaStageCanvas />

        {/* Hero Meta Information */}
        <div className="relative z-[3] p-[clamp(20px,4.5vw,44px)] max-w-[680px] flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[rgba(157,78,221,0.22)] border border-[rgba(199,125,255,0.45)] text-[#e0aaff] text-[11px] font-black uppercase rounded-full tracking-[0.8px] shadow-[0_2px_12px_rgba(157,78,221,0.3)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#c77dff] animate-pulse" />
              Featured Today
            </span>
            <span className="px-2.5 py-1 bg-[rgba(255,255,255,0.08)] border border-[rgba(255,255,255,0.12)] text-[#cbd5e1] text-[11px] font-bold uppercase rounded-full tracking-[0.5px]">
              {isMovie ? "Movie" : "TV Series"}
            </span>
          </div>

          <h1 className="text-[clamp(24px,4.2vw,44px)] font-black leading-[1.12] text-white tracking-[-0.6px] drop-shadow-[0_4px_16px_rgba(0,0,0,0.8)]">
            {title}
          </h1>

          {/* Prestige Media Specs Capsule Bar */}
          <div className="flex flex-wrap items-center gap-2 text-[12px] font-bold">
            {year && (
              <span className="text-[#cbd5e1] font-semibold">{year}</span>
            )}
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[rgba(255,193,7,0.16)] border border-[rgba(255,193,7,0.35)] text-[#ffc107]">
              ★ {rating}
            </span>
            <span className="px-2 py-0.5 rounded-md bg-[rgba(255,255,255,0.08)] border border-[rgba(255,255,255,0.14)] text-[#94a3b8] text-[10px] tracking-wider font-extrabold uppercase">
              4K Ultra HD
            </span>
            <span className="px-2 py-0.5 rounded-md bg-[rgba(255,255,255,0.08)] border border-[rgba(255,255,255,0.14)] text-[#94a3b8] text-[10px] tracking-wider font-extrabold uppercase">
              Dolby Atmos
            </span>
            <span className="px-2 py-0.5 rounded-md bg-[rgba(255,255,255,0.08)] border border-[rgba(255,255,255,0.14)] text-[#94a3b8] text-[10px] tracking-wider font-extrabold uppercase">
              5.1 CH
            </span>
          </div>

          {currentItem.overview && (
            <p className="text-[14px] text-[#cbd5e1] leading-[1.55] line-clamp-2 max-w-[600px] font-normal drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]">
              {currentItem.overview}
            </p>
          )}

          {/* Action Callouts */}
          <div className="flex items-center gap-3.5 mt-2">
            <button
              onClick={playCurrent}
              className="inline-flex items-center gap-2 bg-white text-black font-extrabold text-[15px] px-7 py-3 rounded-full border-none cursor-pointer shadow-[0_4px_20px_rgba(0,0,0,0.5)] hover:bg-neutral-200 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
            >
              <i className="fas fa-play text-[13px]" />
              <span>Watch Now</span>
            </button>
            <button
              onClick={() => {
                openDetail(currentItem.id, isMovie ? "movie" : "tv");
              }}
              className="inline-flex items-center gap-2 bg-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.18)] border border-[rgba(255,255,255,0.18)] text-white font-bold text-[14px] px-6 py-3 rounded-full backdrop-blur-md transition-all duration-200"
            >
              <i className="fas fa-info-circle text-[14px] text-white/70" />
              <span>Details</span>
            </button>
          </div>
        </div>

        {/* Carousel Prev/Next Arrow Paddles */}
        <button
          onClick={prev}
          aria-label="Previous slide"
          className="absolute top-1/2 -translate-y-1/2 left-4 z-[5] bg-[rgba(10,10,18,0.65)] hover:bg-[rgba(255,255,255,0.15)] backdrop-blur-md border border-[rgba(255,255,255,0.16)] text-white text-xl w-10 h-10 rounded-full flex items-center justify-center cursor-pointer opacity-70 hover:opacity-100 hover:scale-105 transition-all duration-200 max-sm:hidden"
        >
          <i className="fas fa-chevron-left text-[14px]" />
        </button>
        <button
          onClick={next}
          aria-label="Next slide"
          className="absolute top-1/2 -translate-y-1/2 right-4 z-[5] bg-[rgba(10,10,18,0.65)] hover:bg-[rgba(255,255,255,0.15)] backdrop-blur-md border border-[rgba(255,255,255,0.16)] text-white text-xl w-10 h-10 rounded-full flex items-center justify-center cursor-pointer opacity-70 hover:opacity-100 hover:scale-105 transition-all duration-200 max-sm:hidden"
        >
          <i className="fas fa-chevron-right text-[14px]" />
        </button>

        {/* Apple TV+ Style Dynamic Progress Indicator Pills */}
        <div className="absolute bottom-5 right-6 z-[5] flex items-center gap-2">
          {items.map((_, idx) => {
            const isCur = idx === activeIndex;
            return (
              <button
                key={idx}
                onClick={() => setActiveIndex(idx)}
                aria-label={`Go to slide ${idx + 1}`}
                className={`relative h-1.5 rounded-full overflow-hidden transition-all duration-300 border-none cursor-pointer p-0 ${
                  isCur ? "w-8 bg-[rgba(255,255,255,0.22)]" : "w-2.5 bg-[rgba(255,255,255,0.28)] hover:bg-[rgba(255,255,255,0.5)]"
                }`}
              >
                {isCur && (
                  <span
                    key={`progress-${activeIndex}`}
                    className="absolute inset-0 bg-white rounded-full origin-left"
                    style={{
                      animation: isPaused ? "none" : "spotlightProgress 6s linear forwards",
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
