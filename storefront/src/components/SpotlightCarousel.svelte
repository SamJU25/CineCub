<script>
  /**
   * SpotlightCarousel.svelte — Svelte 5 Hero Spotlight Carousel Island
   * Uses modern Svelte 5 runes: $state, $derived, $effect
   */
  import { onMount } from 'svelte';

  let items = $state([]);
  let activeIndex = $state(0);
  let isPaused = $state(false);
  let loading = $state(true);

  let currentItem = $derived(items[activeIndex] || null);

  async function fetchSpotlight() {
    try {
      const res = await fetch('/api/tmdb/trending/all/day?page=1');
      if (res.ok) {
        const data = await res.json();
        items = (data.results || [])
          .filter((item) => item.backdrop_path && (item.title || item.name))
          .slice(0, 6);
      }
    } catch (e) {
      console.error('[SpotlightCarousel] failed to load spotlight:', e);
    } finally {
      loading = false;
    }
  }

  function next() {
    if (items.length > 0) {
      activeIndex = (activeIndex + 1) % items.length;
    }
  }

  function prev() {
    if (items.length > 0) {
      activeIndex = (activeIndex - 1 + items.length) % items.length;
    }
  }

  function goTo(idx) {
    activeIndex = idx;
  }

  function playCurrent() {
    if (!currentItem) return;
    const isMovie = currentItem.media_type === 'movie' || Boolean(currentItem.title);
    if (typeof window !== 'undefined' && window.openMediaModal) {
      window.openMediaModal(currentItem.id, isMovie ? 'movie' : 'tv', true);
    } else {
      window.location.href = `/?watch=${currentItem.id}&type=${isMovie ? 'movie' : 'tv'}`;
    }
  }

  onMount(() => {
    fetchSpotlight();

    const interval = setInterval(() => {
      if (!isPaused && items.length > 1) {
        next();
      }
    }, 6000);

    return () => clearInterval(interval);
  });
</script>

<div
  class="spotlight-wrapper"
  onmouseenter={() => (isPaused = true)}
  onmouseleave={() => (isPaused = false)}
  role="region"
  aria-label="Spotlight Carousel"
>
  {#if loading}
    <div class="spotlight-skeleton">
      <span class="spinner"></span>
    </div>
  {:else if currentItem}
    {@const title = currentItem.title || currentItem.name}
    {@const year = (currentItem.release_date || currentItem.first_air_date || '').slice(0, 4)}
    {@const rating = currentItem.vote_average ? currentItem.vote_average.toFixed(1) : '—'}
    {@const backdrop = `https://image.tmdb.org/t/p/w1280${currentItem.backdrop_path}`}

    <div class="spotlight-slide" style={`background-image: url('${backdrop}')`}>
      <div class="gradient-overlay"></div>
      <div class="content-inner">
        <span class="spotlight-badge">🔥 Featured Today</span>
        <h1 class="slide-title">{title}</h1>
        <div class="slide-meta">
          {#if year}<span class="meta-item">{year}</span>{/if}
          <span class="meta-item rating">★ {rating}</span>
          <span class="meta-item type">{currentItem.media_type === 'tv' ? 'TV Series' : 'Movie'}</span>
        </div>
        {#if currentItem.overview}
          <p class="slide-overview">{currentItem.overview}</p>
        {/if}
        <div class="actions-row">
          <button class="btn-play" onclick={playCurrent}>
            ▶ Watch Now
          </button>
          <a
            class="btn-details"
            href={currentItem.media_type === 'tv' ? `/?watch=${currentItem.id}&type=tv` : `/?watch=${currentItem.id}&type=movie`}
          >
            ℹ Details
          </a>
        </div>
      </div>

      <!-- Navigation Arrows -->
      <button class="nav-arrow prev" onclick={prev} aria-label="Previous slide">‹</button>
      <button class="nav-arrow next" onclick={next} aria-label="Next slide">›</button>

      <!-- Indicator Dots -->
      <div class="dots-row">
        {#each items as _, idx}
          <button
            class="dot"
            class:active={idx === activeIndex}
            onclick={() => goTo(idx)}
            aria-label={`Go to slide ${idx + 1}`}
          ></button>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .spotlight-wrapper {
    position: relative;
    width: 100%;
    border-radius: 20px;
    overflow: hidden;
    margin-bottom: 32px;
    border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
  }
  .spotlight-skeleton {
    aspect-ratio: 21 / 9;
    min-height: 320px;
    background: #12121c;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .spinner {
    width: 36px;
    height: 36px;
    border: 3px solid rgba(255, 255, 255, 0.15);
    border-top-color: var(--purple, #9d4edd);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .spotlight-slide {
    position: relative;
    aspect-ratio: 21 / 9;
    min-height: 340px;
    background-size: cover;
    background-position: center 25%;
    display: flex;
    align-items: flex-end;
    transition: background-image 0.5s ease-in-out;
  }
  .gradient-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      180deg,
      rgba(10, 10, 15, 0.1) 0%,
      rgba(10, 10, 15, 0.6) 45%,
      rgba(10, 10, 15, 0.96) 100%
    ),
    linear-gradient(
      90deg,
      rgba(10, 10, 15, 0.95) 0%,
      rgba(10, 10, 15, 0.7) 40%,
      transparent 80%
    );
  }
  .content-inner {
    position: relative;
    z-index: 2;
    padding: clamp(16px, 4vw, 36px);
    max-width: 650px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .spotlight-badge {
    align-self: flex-start;
    padding: 4px 10px;
    background: rgba(157, 78, 221, 0.25);
    border: 1px solid rgba(157, 78, 221, 0.4);
    color: #c77dff;
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    border-radius: 999px;
    letter-spacing: 0.5px;
  }
  .slide-title {
    font-size: clamp(22px, 3.8vw, 40px);
    font-weight: 800;
    line-height: 1.15;
    color: #fff;
    letter-spacing: -0.5px;
  }
  .slide-meta {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
    font-weight: 700;
  }
  .meta-item {
    color: var(--text-2, #a5a6b8);
  }
  .meta-item.rating {
    color: #ffc107;
  }
  .meta-item.type {
    background: rgba(255, 255, 255, 0.1);
    padding: 2px 8px;
    border-radius: 6px;
    font-size: 11px;
  }
  .slide-overview {
    font-size: 14px;
    color: var(--text-2, #b5b6c8);
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    max-width: 580px;
  }
  .actions-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 6px;
  }
  .btn-play {
    background: linear-gradient(135deg, var(--purple-deep, #7b2cbf), var(--purple, #9d4edd));
    color: #fff;
    font-weight: 800;
    font-size: 15px;
    padding: 11px 24px;
    border-radius: 12px;
    border: none;
    cursor: pointer;
    box-shadow: 0 8px 24px rgba(123, 44, 191, 0.45);
    transition: transform 0.2s, filter 0.2s;
  }
  .btn-play:hover {
    filter: brightness(1.15);
    transform: scale(1.03);
  }
  .btn-details {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
    color: var(--text, #fff);
    font-weight: 700;
    font-size: 14px;
    padding: 11px 20px;
    border-radius: 12px;
    text-decoration: none;
    transition: background 0.2s, border-color 0.2s;
  }
  .btn-details:hover {
    background: rgba(255, 255, 255, 0.15);
    border-color: var(--purple, #9d4edd);
  }
  .nav-arrow {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    z-index: 5;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #fff;
    font-size: 24px;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    opacity: 0.7;
    transition: opacity 0.2s, background 0.2s;
  }
  .nav-arrow:hover {
    opacity: 1;
    background: rgba(157, 78, 221, 0.6);
  }
  .nav-arrow.prev { left: 16px; }
  .nav-arrow.next { right: 16px; }

  .dots-row {
    position: absolute;
    bottom: 16px;
    right: 20px;
    z-index: 5;
    display: flex;
    gap: 6px;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.3);
    border: none;
    cursor: pointer;
    transition: background 0.2s, width 0.2s;
  }
  .dot.active {
    background: var(--purple, #9d4edd);
    width: 20px;
    border-radius: 999px;
  }

  @media (max-width: 640px) {
    .spotlight-slide {
      aspect-ratio: 4 / 3;
      min-height: 280px;
    }
    .nav-arrow {
      display: none;
    }
    .slide-overview {
      -webkit-line-clamp: 2;
      font-size: 13px;
    }
  }
</style>
