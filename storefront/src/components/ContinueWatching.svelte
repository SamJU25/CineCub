<script>
  /**
   * ContinueWatching.svelte — Svelte 5 Reactive Continue Watching Island
   * Reads playback progress from local storage and enables 1-click stream resuming.
   */
  import { onMount } from 'svelte';

  let items = $state([]);
  let isVisible = $derived(items.length > 0);

  function loadProgressItems() {
    try {
      const store = JSON.parse(localStorage.getItem('sh_progress_store') || '{}');
      const loaded = [];

      for (const [key, data] of Object.entries(store)) {
        if (data && typeof data.pct === 'number' && data.pct > 0 && data.pct < 98) {
          const isTv = key.includes('_s');
          let id = key;
          let season = 1;
          let episode = 1;

          if (isTv) {
            const parts = key.split('_s');
            id = parts[0];
            const epParts = (parts[1] || '').split('e');
            season = parseInt(epParts[0], 10) || 1;
            episode = parseInt(epParts[1], 10) || 1;
          }

          loaded.push({
            id: parseInt(id, 10),
            type: isTv ? 'tv' : 'movie',
            title: data.title || (isTv ? `Series (${season}x${episode})` : 'Movie'),
            poster: data.poster || null,
            pct: Math.round(data.pct),
            season,
            episode,
            updatedAt: data.updatedAt || 0
          });
        }
      }

      loaded.sort((a, b) => b.updatedAt - a.updatedAt);
      items = loaded.slice(0, 10);
    } catch (e) {
      console.error('[ContinueWatching] failed to parse progress:', e);
    }
  }

  function resume(item) {
    if (typeof window !== 'undefined' && window.openMediaModal) {
      window.openMediaModal(item.id, item.type, true);
    } else {
      window.location.href = `/?watch=${item.id}&type=${item.type}`;
    }
  }

  function removeItem(e, item) {
    e.stopPropagation();
    try {
      const store = JSON.parse(localStorage.getItem('sh_progress_store') || '{}');
      const key = item.type === 'tv' ? `${item.id}_s${item.season}e${item.episode}` : String(item.id);
      delete store[key];
      localStorage.setItem('sh_progress_store', JSON.stringify(store));
      items = items.filter((i) => !(i.id === item.id && i.season === item.season && i.episode === item.episode));
    } catch (err) {
      console.error('[ContinueWatching] failed to remove:', err);
    }
  }

  onMount(() => {
    loadProgressItems();

    // Listen for storage events or custom progress updates
    const handleStorage = () => loadProgressItems();
    window.addEventListener('storage', handleStorage);
    window.addEventListener('playback-progress-updated', handleStorage);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('playback-progress-updated', handleStorage);
    };
  });
</script>

{#if isVisible}
  <section class="continue-watching-section">
    <div class="section-header">
      <h2 class="section-title">▶ Continue Watching</h2>
      <span class="count-badge">{items.length} in progress</span>
    </div>

    <div class="cards-scroll">
      {#each items as item}
        <div class="cw-card" onclick={() => resume(item)} role="button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && resume(item)}>
          <div class="cw-poster-wrapper">
            <img
              src={item.poster ? `https://image.tmdb.org/t/p/w300${item.poster}` : '/placeholder.svg'}
              alt={item.title}
              loading="lazy"
              width="180"
              height="100"
            />
            <div class="play-overlay">
              <span class="play-icon">▶</span>
            </div>
            <button class="btn-remove" onclick={(e) => removeItem(e, item)} title="Remove from Continue Watching">✕</button>
            <div class="progress-bar-container">
              <div class="progress-bar-fill" style={`width: ${item.pct}%`}></div>
            </div>
          </div>
          <div class="cw-info">
            <span class="cw-title">{item.title}</span>
            <span class="cw-meta">{item.pct}% watched {item.type === 'tv' ? `· S${item.season} E${item.episode}` : ''}</span>
          </div>
        </div>
      {/each}
    </div>
  </section>
{/if}

<style>
  .continue-watching-section {
    margin-bottom: 32px;
  }
  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
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
  .cards-scroll {
    display: flex;
    gap: 14px;
    overflow-x: auto;
    padding-bottom: 8px;
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.15) transparent;
  }
  .cards-scroll::-webkit-scrollbar {
    height: 4px;
  }
  .cards-scroll::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 4px;
  }
  .cw-card {
    flex: 0 0 200px;
    background: #14141f;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    overflow: hidden;
    cursor: pointer;
    transition: transform 0.18s, border-color 0.18s;
  }
  .cw-card:hover {
    transform: translateY(-3px);
    border-color: rgba(157, 78, 221, 0.45);
  }
  .cw-poster-wrapper {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    background: #0d0d14;
    overflow: hidden;
  }
  .cw-poster-wrapper img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .play-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.2s;
  }
  .cw-card:hover .play-overlay {
    opacity: 1;
  }
  .play-icon {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: var(--purple, #9d4edd);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    padding-left: 2px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  }
  .btn-remove {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.6);
    color: #fff;
    border: none;
    font-size: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.2s, background 0.2s;
    z-index: 3;
  }
  .cw-card:hover .btn-remove {
    opacity: 1;
  }
  .btn-remove:hover {
    background: rgba(255, 59, 48, 0.8);
  }
  .progress-bar-container {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: rgba(255, 255, 255, 0.2);
  }
  .progress-bar-fill {
    height: 100%;
    background: var(--purple, #9d4edd);
  }
  .cw-info {
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .cw-title {
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: #fff;
  }
  .cw-meta {
    font-size: 11px;
    color: #a5a6b8;
  }
</style>
