"use client";

import { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";

interface ProgressItem {
  id: number;
  type: "movie" | "tv";
  title: string;
  poster: string | null;
  pct: number;
  season: number;
  episode: number;
  updatedAt: number;
}

interface StoredProgressData {
  pct?: number;
  title?: string;
  poster?: string | null;
  updatedAt?: number;
}

export default function ContinueWatching() {
  const [items, setItems] = useState<ProgressItem[]>([]);
  const openPlayer = useStore((s) => s.openPlayer);

  const loadProgressItems = useCallback(() => {
    try {
      const store = JSON.parse(localStorage.getItem("sh_progress_store") || "{}");
      const loaded: ProgressItem[] = [];

      for (const [key, data] of Object.entries(store) as [string, StoredProgressData][]) {
        if (data && typeof data.pct === "number" && data.pct > 0 && data.pct < 98) {
          const isTv = key.includes("_s");
          let id = key;
          let season = 1;
          let episode = 1;

          if (isTv) {
            const parts = key.split("_s");
            id = parts[0];
            const epParts = (parts[1] || "").split("e");
            season = parseInt(epParts[0], 10) || 1;
            episode = parseInt(epParts[1], 10) || 1;
          }

          loaded.push({
            id: parseInt(id, 10),
            type: isTv ? "tv" : "movie",
            title: data.title || (isTv ? `Series (${season}x${episode})` : "Movie"),
            poster: data.poster || null,
            pct: Math.round(data.pct),
            season,
            episode,
            updatedAt: data.updatedAt || 0,
          });
        }
      }

      loaded.sort((a, b) => b.updatedAt - a.updatedAt);
      setItems(loaded.slice(0, 10));
    } catch (e) {
      console.error("[ContinueWatching] failed to parse progress:", e);
    }
  }, []);

  function resume(item: ProgressItem) {
    openPlayer(item.id, item.type, item.title, item.season, item.episode, item.poster ?? undefined);
  }

  function removeItem(e: React.MouseEvent, item: ProgressItem) {
    e.stopPropagation();
    try {
      const store = JSON.parse(localStorage.getItem("sh_progress_store") || "{}");
      const key = item.type === "tv" ? `${item.id}_s${item.season}e${item.episode}` : String(item.id);
      delete store[key];
      localStorage.setItem("sh_progress_store", JSON.stringify(store));
      setItems((prev) => prev.filter((i) => !(i.id === item.id && i.season === item.season && i.episode === item.episode)));
    } catch (err) {
      console.error("[ContinueWatching] failed to remove:", err);
    }
  }

  useEffect(() => {
    loadProgressItems();
    const handleStorage = () => loadProgressItems();
    window.addEventListener("storage", handleStorage);
    window.addEventListener("playback-progress-updated", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("playback-progress-updated", handleStorage);
    };
  }, [loadProgressItems]);

  if (items.length === 0) return null;

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3.5">
        <h2 className="text-xl font-extrabold text-white tracking-tight">Continue Watching</h2>
        <span className="text-xs font-semibold text-white/70 bg-white/10 px-2.5 py-[3px] rounded-full">
          {items.length} in progress
        </span>
      </div>

      <div className="flex gap-3.5 overflow-x-auto pb-2 scrollbar-thin scrollbar-color-[rgba(255,255,255,0.15)]_transparent">
        {items.map((item) => (
          <div
            key={`${item.id}-${item.season}-${item.episode}`}
            onClick={() => resume(item)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && resume(item)}
            className="group flex-shrink-0 w-[200px] bg-[#14141f] border border-[rgba(255,255,255,0.08)] rounded-xl overflow-hidden cursor-pointer hover:-translate-y-[3px] hover:border-white/20 transition-all duration-[180ms]"
          >
            <div className="relative w-full aspect-video bg-[#0d0d14] overflow-hidden">
              <img
                src={item.poster ? `https://image.tmdb.org/t/p/w300${item.poster}` : "/placeholder.svg"}
                alt={item.title}
                loading="lazy"
                width={180}
                height={100}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = "/placeholder.svg";
                }}
              />
              <div className="absolute inset-0 bg-[rgba(0,0,0,0.35)] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <span className="w-[34px] h-[34px] rounded-full bg-white text-black flex items-center justify-center text-[13px] pl-[2px] shadow-[0_4px_16px_rgba(0,0,0,0.5)]">▶</span>
              </div>
              <button
                onClick={(e) => removeItem(e, item)}
                title="Remove from Continue Watching"
                aria-label="Remove from Continue Watching"
                className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/70 text-white/90 border border-white/10 text-xs flex items-center justify-center cursor-pointer opacity-90 md:opacity-0 md:group-hover:opacity-100 hover:bg-red-500/80 transition-all duration-150 z-[3]"
              >
                ✕
              </button>
              <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-[rgba(255,255,255,0.2)]">
                <div className="h-full bg-red-500" style={{ width: `${item.pct}%` }} />
              </div>
            </div>
            <div className="px-2.5 py-2 flex flex-col gap-0.5">
              <span className="text-xs font-bold text-white whitespace-nowrap overflow-hidden text-ellipsis">{item.title}</span>
              <span className="text-[11px] text-[#a5a6b8]">
                {item.pct}% watched {item.type === "tv" ? `· S${item.season} E${item.episode}` : ""}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
