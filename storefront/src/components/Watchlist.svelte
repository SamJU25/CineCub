<script>
  /**
   * Watchlist.svelte — Svelte 5 Reactive Watchlist Island
   * Uses modern Svelte 5 runes: $state, $derived, $effect
   */
  import { onMount } from 'svelte';

  let watchlist = $state([]);
  let isVisible = $derived(watchlist.length > 0);

  function loadWatchlist() {
    try {
      const items = JSON.parse(localStorage.getItem('sh_watchlist_store') || '[]');
      watchlist = Array.isArray(items) ? items : [];
    } catch (e) {
      console.error('[Watchlist] failed to parse store:', e);
    }
  }

  function playItem(item) {
    if (typeof window !== 'undefined' && window.openMediaModal) {
      window.openMediaModal(item.id, item.type || 'movie', true);
    } else {
      window.location.href = `/?watch=${item.id}&type=${item.type || 'movie'}`;
    }
  }

  function removeItem(e, id) {
    e.stopPropagation();
    try {
      const updated = watchlist.filter((item) => item.id !== id);
      watchlist = updated;
      localStorage.setItem('sh_watchlist_store', JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('watchlist-updated'));
    } catch (e) {
      console.error('[Watchlist] failed to remove item:', e);
    }
  }

  onMount(() => {
    loadWatchlist();

    const handleUpdate = () => loadWatchlist();
    window.addEventListener('storage', handleUpdate);
    window.addEventListener('watchlist-updated', handleUpdate);

    return () => {
      window.removeEventListener('storage', handleUpdate);
      window.removeEventListener('watchlist-updated', handleUpdate);
    };
  });
</script>

{#if isVisible}
  <section class="watchlist-section">
    <div class="section-header">
      <h2 class="section-title">🔖 My Watchlist</h2>
      <span class="count-badge">{watchlist.length} saved</span>
    </div>

    <div class="cards-grid">
      {#each watchlist as item}
        <div
          class="wl-card"
          onclick={() => playItem(item)}
          role="button"
          tabindex="0"
          onkeydown={(e) => e.key === 'Enter' && playItem(item)}
        >
          <div class="poster-wrapper">
            <img
              src={item.poster ? `https://image.tmdb.org/t/p/w300${item.poster}` : '/placeholder.svg'}
              alt={item.title}
              loading="lazy"
              width="150"
              height="225"
            />
            <button
              class="btn-remove"
              onclick={(e) => removeItem(e, item.id)}
              title="Remove from Watchlist"
              aria-label="Remove item"
            >
              ✕
            </button>
            <div class="play-overlay">
              <span class="play-icon">▶</span>
            </div>
          </div>
          <div class="card-info">
            <span class="card-title">{item.title}</span>
            <span class="card-meta">
              {item.type === 'tv' ? 'Series' : 'Movie'} {item.year ? `· ${item.year}` : ''}
            </span>
          </div>
        </div>
      {/each}
    </div>
  </section>
{/if}

<style>
  .watchlist-section {
    margin-bottom: 36px;
  }
  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }
  .section-title {
    font-size: 20px;
    font-weight: 800;
    color: #fff;
    letter-spacing: -0.3px;
  }
  .count-badge {
    font-size: 12px;
    font-weight: 700;
    color: var(--purple, #9d4edd);
    background: rgba(157, 78, 221, 0.12);
    padding: 3px 10px;
    border-radius: 999px;
  }
  .cards-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 14px;
  }
  @media (min-width: 768px) {
    .cards-grid {
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 18px;
    }
  }
  .wl-card {
    background: #12121c;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    overflow: hidden;
    cursor: pointer;
    transition: transform 0.18s, border-color 0.18s;
  }
  .wl-card:hover {
    transform: translateY(-4px);
    border-color: rgba(157, 78, 221, 0.45);
  }
  .poster-wrapper {
    position: relative;
    width: 100%;
    aspect-ratio: 2 / 3;
    background: #0d0d14;
  }
  .poster-wrapper img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .play-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.2s;
  }
  .wl-card:hover .play-overlay {
    opacity: 1;
  }
  .play-icon {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background: var(--purple, #9d4edd);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
    padding-left: 2px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
  }
  .btn-remove {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.7);
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.2);
    font-size: 11px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    opacity: 0.8;
    transition: opacity 0.2s, background 0.2s;
    z-index: 3;
  }
  .wl-card:hover .btn-remove {
    opacity: 1;
  }
  .btn-remove:hover {
    background: rgba(255, 59, 48, 0.85);
  }
  .card-info {
    padding: 8px 10px 10px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .card-title {
    font-size: 13px;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: #fff;
  }
  .card-meta {
    font-size: 11px;
    color: var(--text-3, #7e8094);
  }
</style>
