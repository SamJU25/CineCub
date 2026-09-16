"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useStore } from "@/lib/store";

interface SpotlightItem {
  id: number;
  media_type: string;
  title?: string;
  name?: string;
  poster_path?: string;
  backdrop_path?: string;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
}

export default function SpotlightCarousel() {
  const [items, setItems] = useState<SpotlightItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const openPlayer = useStore((s) => s.openPlayer);
  const openDetail = useStore((s) => s.openDetail);

  const currentItem = items[activeIndex] || null;

  const fetchSpotlight = useCallback(async () => {
    try {
      const res = await fetch("/api/tmdb/trending/all/day?page=1");
      if (res.ok) {
        const data = await res.json();
        setItems(
          (data.results || [])
            .filter((item: SpotlightItem) => item.backdrop_path && (item.title || item.name))
            .slice(0, 6)
        );
      }
    } catch (e) {
      console.error("[SpotlightCarousel] failed to load spotlight:", e);
    } finally {
      setLoading(false);
    }
  }, []);

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
    if (!currentItem) return;
    const isMovie = currentItem.media_type === "movie" || Boolean(currentItem.title);
    const title = currentItem.title || currentItem.name || "Untitled";
    const poster = (currentItem.poster_path || currentItem.backdrop_path) ?? undefined;
    openPlayer(currentItem.id, isMovie ? "movie" : "tv", title, undefined, undefined, poster);
  }

  useEffect(() => {
    fetchSpotlight();
  }, [fetchSpotlight]);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      if (!isPaused && items.length > 1) {
        next();
      }
    }, 6000);
    return () => clearInterval(intervalRef.current);
  }, [isPaused, items.length, next]);

  if (loading) {
    return (
      <div className="relative w-full rounded-[20px] overflow-hidden mb-8 border border-[rgba(255,255,255,0.08)] shadow-[0_16px_48px_rgba(0,0,0,0.5)]">
        <div className="aspect-[21/9] min-h-[320px] bg-[#12121c] flex items-center justify-center">
          <span className="w-9 h-9 border-[3px] border-[rgba(255,255,255,0.15)] border-t-[#9d4edd] rounded-full animate-[spin_0.7s_linear_infinite]" />
        </div>
      </div>
    );
  }

  if (!currentItem) return null;

  const title = currentItem.title || currentItem.name;
  const year = (currentItem.release_date || currentItem.first_air_date || "").slice(0, 4);
  const rating = typeof currentItem.vote_average === "number" && currentItem.vote_average > 0 ? currentItem.vote_average.toFixed(1) : "—";
  const backdrop = `https://image.tmdb.org/t/p/w1280${currentItem.backdrop_path}`;

  return (
    <div
      className="relative w-full rounded-[20px] overflow-hidden mb-8 border border-[rgba(255,255,255,0.08)] shadow-[0_16px_48px_rgba(0,0,0,0.5)]"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      role="region"
      aria-label="Spotlight Carousel"
    >
      <div
        className="relative aspect-[21/9] min-h-[340px] bg-cover bg-center flex items-end transition-[background-image] duration-500"
        style={{ backgroundImage: `url('${backdrop}')`, backgroundPosition: "center 25%" }}
      >
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,10,15,0.1)_0%,rgba(10,10,15,0.6)_45%,rgba(10,10,15,0.96)_100%),linear-gradient(90deg,rgba(10,10,15,0.95)_0%,rgba(10,10,15,0.7)_40%,transparent_80%)]" />

        <div className="relative z-[2] p-[clamp(16px,4vw,36px)] max-w-[650px] flex flex-col gap-2.5">
          <span className="self-start px-2.5 py-1 bg-[rgba(157,78,221,0.25)] border border-[rgba(157,78,221,0.4)] text-[#c77dff] text-[11px] font-extrabold uppercase rounded-full tracking-[0.5px]">
            🔥 Featured Today
          </span>
          <h1 className="text-[clamp(22px,3.8vw,40px)] font-extrabold leading-[1.15] text-white tracking-[-0.5px]">{title}</h1>
          <div className="flex items-center gap-2.5 text-[13px] font-bold">
            {year && <span className="text-[#a5a6b8]">{year}</span>}
            <span className="text-[#ffc107]">★ {rating}</span>
            <span className="bg-[rgba(255,255,255,0.1)] px-2 py-[2px] rounded-md text-[11px] text-[#a5a6b8]">
              {currentItem.media_type === "tv" ? "TV Series" : "Movie"}
            </span>
          </div>
          {currentItem.overview && (
            <p className="text-[14px] text-[#b5b6c8] leading-[1.5] line-clamp-2 max-w-[580px]">
              {currentItem.overview}
            </p>
          )}
          <div className="flex items-center gap-3 mt-1.5">
            <button
              onClick={playCurrent}
              className="bg-gradient-to-br from-[#7b2cbf] to-[#9d4edd] text-white font-extrabold text-[15px] px-6 py-[11px] rounded-xl border-none cursor-pointer shadow-[0_8px_24px_rgba(0,0,0,0.5)] hover:brightness-110 hover:scale-[1.03] transition-all duration-200"
            >
              ▶ Watch Now
            </button>
            <button
              onClick={() => {
                const isMovie = currentItem.media_type === "movie" || Boolean(currentItem.title);
                openDetail(currentItem.id, isMovie ? "movie" : "tv");
              }}
              className="bg-[rgba(255,255,255,0.08)] border border-[rgba(255,255,255,0.12)] text-white font-bold text-[14px] px-5 py-[11px] rounded-xl hover:bg-[rgba(255,255,255,0.15)] hover:border-[#9d4edd] transition-colors duration-200"
            >
              ℹ Details
            </button>
          </div>
        </div>

        <button onClick={prev} aria-label="Previous slide" className="absolute top-1/2 -translate-y-1/2 left-4 z-[5] bg-[rgba(0,0,0,0.4)] backdrop-blur-[8px] border border-[rgba(255,255,255,0.15)] text-white text-2xl w-[38px] h-[38px] rounded-full flex items-center justify-center cursor-pointer opacity-70 hover:opacity-100 hover:bg-[rgba(157,78,221,0.6)] transition-all duration-200 max-sm:hidden">
          ‹
        </button>
        <button onClick={next} aria-label="Next slide" className="absolute top-1/2 -translate-y-1/2 right-4 z-[5] bg-[rgba(0,0,0,0.4)] backdrop-blur-[8px] border border-[rgba(255,255,255,0.15)] text-white text-2xl w-[38px] h-[38px] rounded-full flex items-center justify-center cursor-pointer opacity-70 hover:opacity-100 hover:bg-[rgba(157,78,221,0.6)] transition-all duration-200 max-sm:hidden">
          ›
        </button>

        <div className="absolute bottom-4 right-5 z-[5] flex gap-1.5">
          {items.map((_, idx) => (
            <button
              key={idx}
              className={`h-2 rounded-full border-none cursor-pointer transition-all duration-200 ${
                idx === activeIndex ? "bg-[#9d4edd] w-5 rounded-full" : "bg-[rgba(255,255,255,0.3)] w-2"
              }`}
              onClick={() => setActiveIndex(idx)}
              aria-label={`Go to slide ${idx + 1}`}
            />
          ))}
        </div>
      </div>

    </div>
  );
}
