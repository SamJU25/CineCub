"use client";

import { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";

interface WatchlistItem {
  id: number;
  type: string;
  title: string;
  poster: string | null;
  poster_path?: string | null;
  season?: number;
  episode?: number;
  year?: string;
}

export default function Watchlist() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const openPlayer = useStore((s) => s.openPlayer);

  const loadWatchlist = useCallback(() => {
    try {
      const items = JSON.parse(localStorage.getItem("sh_watchlist_store") || "[]");
      setWatchlist(Array.isArray(items) ? items : []);
    } catch (e) {
      console.error("[Watchlist] failed to parse store:", e);
    }
  }, []);

  function playItem(item: WatchlistItem) {
    const poster = (item.poster || item.poster_path) ?? undefined;
    openPlayer(item.id, item.type || "movie", item.title, item.season, item.episode, poster);
  }

  function removeItem(e: React.MouseEvent, id: number) {
    e.stopPropagation();
    try {
      const updated = watchlist.filter((item) => item.id !== id);
      setWatchlist(updated);
      localStorage.setItem("sh_watchlist_store", JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent("watchlist-updated"));
    } catch (e) {
      console.error("[Watchlist] failed to remove item:", e);
    }
  }

  useEffect(() => {
    loadWatchlist();
    const handleUpdate = () => loadWatchlist();
    window.addEventListener("storage", handleUpdate);
    window.addEventListener("watchlist-updated", handleUpdate);
    return () => {
      window.removeEventListener("storage", handleUpdate);
      window.removeEventListener("watchlist-updated", handleUpdate);
    };
  }, [loadWatchlist]);

  if (watchlist.length === 0) return null;

  return (
    <section className="mb-9">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-extrabold text-white tracking-tight">🔖 My Watchlist</h2>
        <span className="text-xs font-bold text-[#9d4edd] bg-[rgba(157,78,221,0.12)] px-2.5 py-[3px] rounded-full">
          {watchlist.length} saved
        </span>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3.5 md:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] md:gap-4.5">
        {watchlist.map((item) => (
          <div
            key={item.id}
            onClick={() => playItem(item)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && playItem(item)}
            className="group bg-[#12121c] border border-[rgba(255,255,255,0.08)] rounded-xl overflow-hidden cursor-pointer hover:-translate-y-1 hover:border-[rgba(157,78,221,0.45)] transition-all duration-[180ms]"
          >
            <div className="relative w-full aspect-[2/3] bg-[#0d0d14]">
              <img
                src={item.poster ? `https://image.tmdb.org/t/p/w300${item.poster}` : "/placeholder.svg"}
                alt={item.title}
                loading="lazy"
                width={150}
                height={225}
                className="w-full h-full object-cover"
              />
              <button
                onClick={(e) => removeItem(e, item.id)}
                title="Remove from Watchlist"
                aria-label="Remove item"
                className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-[rgba(0,0,0,0.7)] text-white border border-[rgba(255,255,255,0.2)] text-[11px] flex items-center justify-center cursor-pointer opacity-80 hover:opacity-100 hover:bg-[rgba(255,59,48,0.85)] transition-all duration-200 z-[3]"
              >
                ✕
              </button>
              <div className="absolute inset-0 bg-[rgba(0,0,0,0.4)] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <span className="w-[38px] h-[38px] rounded-full bg-[#9d4edd] text-white flex items-center justify-center text-[15px] pl-[2px] shadow-[0_4px_16px_rgba(0,0,0,0.6)]">▶</span>
              </div>
            </div>
            <div className="px-2.5 py-2 pb-2.5 flex flex-col gap-0.5">
              <span className="text-[13px] font-bold text-white whitespace-nowrap overflow-hidden text-ellipsis">{item.title}</span>
              <span className="text-[11px] text-[#7e8094]">
                {item.type === "tv" ? "Series" : "Movie"} {item.year ? `· ${item.year}` : ""}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
