"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";

interface HScrollWrapperProps {
  children: React.ReactNode;
  id?: string;
  className?: string;
  wrapperClassName?: string;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  scrollAmount?: number;
  style?: React.CSSProperties;
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
}

export default function HScrollWrapper({
  children,
  id,
  className = "",
  wrapperClassName = "",
  scrollRef,
  scrollAmount = 600,
  style,
  onScroll,
  onLoadMore,
  hasMore = false,
  isLoadingMore = false,
}: HScrollWrapperProps) {
  const localRef = useRef<HTMLDivElement>(null);
  const containerRef = scrollRef || localRef;

  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Keep fresh refs to avoid stale closures in scroll and click handlers
  const onLoadMoreRef = useRef(onLoadMore);
  const hasMoreRef = useRef(hasMore);
  const isLoadingMoreRef = useRef(isLoadingMore);

  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
    hasMoreRef.current = hasMore;
    isLoadingMoreRef.current = isLoadingMore;
  });

  const updateArrows = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const scrollLeft = el.scrollLeft;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(scrollLeft > 15);
    setCanScrollRight((hasMoreRef.current && maxScroll > 15) || (maxScroll > 15 && scrollLeft < maxScroll - 15));
  }, [containerRef]);

  const checkNearEnd = useCallback(() => {
    const el = containerRef.current;
    if (!el || !onLoadMoreRef.current || hasMoreRef.current === false || isLoadingMoreRef.current) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    if (maxScroll > 0 && el.scrollLeft > maxScroll - 900) {
      onLoadMoreRef.current();
    }
  }, [containerRef]);

  // Sync arrow buttons on mount, scroll, resize, and DOM changes
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    updateArrows();
    const timer = setTimeout(updateArrows, 400);

    const handleScroll = () => {
      window.requestAnimationFrame(() => {
        updateArrows();
        checkNearEnd();
      });
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", updateArrows);

    // Watch for dynamic card additions/removals
    const observer = new MutationObserver(() => {
      setTimeout(updateArrows, 100);
    });
    observer.observe(el, { childList: true, subtree: true });

    return () => {
      clearTimeout(timer);
      el.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", updateArrows);
      observer.disconnect();
    };
  }, [updateArrows, checkNearEnd, containerRef]);

  // Also update when children change
  useEffect(() => {
    const timer = setTimeout(updateArrows, 150);
    return () => clearTimeout(timer);
  }, [children, updateArrows]);

  // Desktop drag-to-scroll support matching legacy initDragScroll
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if ("ontouchstart" in window && navigator.maxTouchPoints > 0) return;

    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;
    let isDragging = false;

    const onMouseDown = (e: MouseEvent) => {
      // Ignore clicks on buttons or links
      if ((e.target as HTMLElement).closest(".hscroll-btn")) return;
      isDown = true;
      isDragging = false;
      startX = e.pageX - el.offsetLeft;
      scrollLeft = el.scrollLeft;
    };

    const onMouseLeave = () => {
      isDown = false;
      isDragging = false;
      el.classList.remove("dragging");
    };

    const onMouseUp = () => {
      isDown = false;
      el.classList.remove("dragging");
      setTimeout(() => {
        isDragging = false;
      }, 60);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDown) return;
      const x = e.pageX - el.offsetLeft;
      const walk = (x - startX) * 1.8;
      if (Math.abs(walk) > 10) {
        isDragging = true;
        el.classList.add("dragging");
        el.scrollLeft = scrollLeft - walk;
        checkNearEnd();
      }
    };

    const onClickCapture = (e: MouseEvent) => {
      if (isDragging) {
        e.preventDefault();
        e.stopPropagation();
        isDragging = false;
      }
    };

    el.addEventListener("mousedown", onMouseDown);
    el.addEventListener("mouseleave", onMouseLeave);
    el.addEventListener("mouseup", onMouseUp);
    el.addEventListener("mousemove", onMouseMove);
    el.addEventListener("click", onClickCapture, true);

    return () => {
      el.removeEventListener("mousedown", onMouseDown);
      el.removeEventListener("mouseleave", onMouseLeave);
      el.removeEventListener("mouseup", onMouseUp);
      el.removeEventListener("mousemove", onMouseMove);
      el.removeEventListener("click", onClickCapture, true);
    };
  }, [containerRef, checkNearEnd]);

  const handleScrollClick = (direction: -1 | 1) => {
    const el = containerRef.current;
    if (!el) return;
    const step = window.innerWidth > 768 ? scrollAmount : 300;
    el.scrollBy({ left: direction * step, behavior: "smooth" });
    setTimeout(() => {
      updateArrows();
      if (direction === 1) checkNearEnd();
    }, 150);
    setTimeout(() => {
      updateArrows();
      if (direction === 1) checkNearEnd();
    }, 450);
  };

  return (
    <div className={`hscroll-wrapper ${wrapperClassName}`}>
      <div
        className={`hscroll-btn left${canScrollLeft ? " visible" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          handleScrollClick(-1);
        }}
        aria-label="Scroll left"
        role="button"
        tabIndex={0}
      >
        <i className="fas fa-chevron-left" />
      </div>

      <div
        ref={containerRef as React.RefObject<HTMLDivElement | null>}
        className={`cv-hscroll ${className}`}
        id={id}
        style={style}
        onScroll={(e) => {
          updateArrows();
          checkNearEnd();
          onScroll?.(e);
        }}
      >
        {children}
        {isLoadingMore && (
          <div
            className="hscroll-loading-spinner"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: "120px",
              height: "240px",
              flexShrink: 0,
              color: "var(--cv-purple-light, #c77dff)",
              fontSize: "24px",
            }}
          >
            <i className="fas fa-circle-notch fa-spin" />
          </div>
        )}
      </div>

      <div
        className={`hscroll-btn right${canScrollRight ? " visible" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          handleScrollClick(1);
        }}
        aria-label="Scroll right"
        role="button"
        tabIndex={0}
      >
        <i className="fas fa-chevron-right" />
      </div>
    </div>
  );
}
