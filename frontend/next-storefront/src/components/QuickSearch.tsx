"use client";

import { useState, useEffect, useRef } from "react";
import { useStore } from "@/lib/store";

interface SearchResult {
  id: number;
  media_type: string;
  title?: string;
  name?: string;
  poster_path?: string;
  release_date?: string;
  first_air_date?: string;
  popularity?: number;
  vote_average?: number;
  vote_count?: number;
}

function rankResults(items: SearchResult[], q: string): SearchResult[] {
  if (!items || !items.length) return [];
  const cleanQuery = q.trim().toLowerCase();
  if (!cleanQuery) return items;

  return items.slice().sort((a, b) => {
    const titleA = ((a && (a.title || a.name)) || "").trim().toLowerCase();
    const titleB = ((b && (b.title || b.name)) || "").trim().toLowerCase();

    const score = (item: SearchResult, title: string) => {
      let s = 0;
      const norm = title.replace(/^(the|a|an)\s+/i, "");

      if (title === cleanQuery || norm === cleanQuery) s += 1000;
      else if (title.indexOf(cleanQuery) === 0 || norm.indexOf(cleanQuery) === 0) s += 400;
      else if (new RegExp("\\b" + cleanQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(title)) s += 200;
      else if (title.indexOf(cleanQuery) !== -1) s += 100;

      const pop = Number(item.popularity) || 0;
      if (pop > 0) s += Math.min(300, Math.log10(1 + pop) * 60);

      const voteCount = Number(item.vote_count) || 0;
      const voteAvg = Number(item.vote_average) || 0;
      if (voteCount >= 30) s += Math.min(100, voteAvg * 10);

      return s;
    };

    return score(b, titleB) - score(a, titleA);
  });
}

export default function QuickSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const seqRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const openDetail = useStore((s) => s.openDetail);

  useEffect(() => {
    const currentQuery = query;
    clearTimeout(timerRef.current);
    if (!currentQuery) {
      seqRef.current++;
      setResults([]);
      setLoading(false);
      return;
    }
    timerRef.current = setTimeout(async () => {
      const trimmed = currentQuery.trim();
      if (trimmed.length < 2) {
        seqRef.current++;
        setResults([]);
        setLoading(false);
        return;
      }
      const seq = ++seqRef.current;
      setLoading(true);
      try {
        const res = await fetch(`/api/tmdb/search/multi?query=${encodeURIComponent(trimmed)}&page=1`);
        if (seq !== seqRef.current) return;
        if (res.ok) {
          const data = await res.json();
          if (seq !== seqRef.current) return;
          const filtered = (data.results || []).filter(
            (item: SearchResult) => (item.title || item.name) && item.poster_path
          );
          setResults(rankResults(filtered, trimmed).slice(0, 6));
        }
      } catch (e) {
        if (seq === seqRef.current) {
          console.error("[QuickSearch] search failed:", e);
        }
      } finally {
        if (seq === seqRef.current) {
          setLoading(false);
        }
      }
    }, 250);

    return () => clearTimeout(timerRef.current);
  }, [query]);

  const hasResults = results.length > 0;

  return (
    <div className={`relative w-full max-w-[380px] ${isOpen && hasResults ? "open" : ""}`}>
      <div className="relative flex items-center">
        <span className="absolute left-3 text-[14px] opacity-60 pointer-events-none">🔍</span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Quick search movies & shows..."
          aria-label="Quick search movies and shows"
          aria-autocomplete="list"
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 200)}
          className="w-full py-[9px] pl-9 pr-9 bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.1)] rounded-[10px] text-white text-[13px] outline-none focus:bg-[rgba(255,255,255,0.1)] focus:border-[#9d4edd] transition-colors duration-200"
        />
        {loading ? (
          <span className="absolute right-3 w-[14px] h-[14px] border-2 border-[rgba(255,255,255,0.2)] border-t-[#9d4edd] rounded-full animate-[spin_0.6s_linear_infinite]" />
        ) : query ? (
          <button
            onClick={() => setQuery("")}
            aria-label="Clear"
            className="absolute right-2.5 bg-none border-none text-[#888] cursor-pointer text-[12px] p-1"
          >
            ✕
          </button>
        ) : null}
      </div>

      {isOpen && hasResults && (
        <div className="absolute top-[calc(100%+6px)] left-0 right-0 bg-[#14141f] border border-[rgba(255,255,255,0.12)] rounded-xl shadow-[0_16px_36px_rgba(0,0,0,0.6)] overflow-hidden z-[100]">
          {results.map((item) => {
            const isMovie = item.media_type === "movie" || Boolean(item.title);
            const title = item.title || item.name;
            const year = (item.release_date || item.first_air_date || "").slice(0, 4);
            return (
              <a
                key={item.id}
                className="flex items-center gap-3 px-3 py-2 text-inherit no-underline hover:bg-[rgba(157,78,221,0.15)] transition-colors duration-150"
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  const isMovie = item.media_type === "movie" || Boolean(item.title);
                  openDetail(item.id, isMovie ? "movie" : "tv");
                  setIsOpen(false);
                }}
              >
                <img
                  src={`https://image.tmdb.org/t/p/w92${item.poster_path}`}
                  alt={title}
                  width={36}
                  height={54}
                  className="rounded-[6px] object-cover"
                />
                <div className="flex flex-col min-w-0">
                  <span className="text-[13px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis">{title}</span>
                  <span className="text-[11px] text-[#7e8094]">
                    {isMovie ? "Movie" : "Series"} {year ? `· ${year}` : ""}
                  </span>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
