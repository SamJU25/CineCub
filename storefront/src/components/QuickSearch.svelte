<script>
  /**
   * QuickSearch.svelte — Svelte 5 Interactive Search Island
   * Uses modern Svelte 5 runes: $state, $derived, $effect
   */
  let query = $state('');
  let results = $state([]);
  let loading = $state(false);
  let isOpen = $state(false);

  let hasResults = $derived(results.length > 0);

  async function handleSearch(term) {
    const trimmed = term.trim();
    if (trimmed.length < 2) {
      results = [];
      loading = false;
      return;
    }

    loading = true;
    try {
      const res = await fetch(`/api/tmdb/search/multi?query=${encodeURIComponent(trimmed)}&page=1`);
      if (res.ok) {
        const data = await res.json();
        results = (data.results || [])
          .filter((item) => (item.title || item.name) && item.poster_path)
          .slice(0, 6);
      }
    } catch (e) {
      console.error('[QuickSearch] search failed:', e);
    } finally {
      loading = false;
    }
  }

  // Debounced effect for reactive search on query input
  let timer;
  $effect(() => {
    const currentQuery = query;
    clearTimeout(timer);
    if (!currentQuery) {
      results = [];
      loading = false;
      return;
    }
    timer = setTimeout(() => {
      handleSearch(currentQuery);
    }, 250);

    return () => clearTimeout(timer);
  });
</script>

<div class="sh-quick-search" class:open={isOpen && hasResults}>
  <div class="input-wrapper">
    <span class="search-icon">🔍</span>
    <input
      type="text"
      bind:value={query}
      placeholder="Quick search movies & shows..."
      onfocus={() => (isOpen = true)}
      onblur={() => setTimeout(() => (isOpen = false), 200)}
    />
    {#if loading}
      <span class="spinner"></span>
    {:else if query}
      <button class="clear-btn" onclick={() => (query = '')} aria-label="Clear">✕</button>
    {/if}
  </div>

  {#if isOpen && hasResults}
    <div class="results-dropdown">
      {#each results as item}
        {@const isMovie = item.media_type === 'movie' || Boolean(item.title)}
        {@const title = item.title || item.name}
        {@const year = (item.release_date || item.first_air_date || '').slice(0, 4)}
        {@const href = isMovie ? `/?watch=${item.id}&type=movie` : `/?watch=${item.id}&type=tv`}
        <a
          class="result-item"
          {href}
          onclick={(e) => {
            if (typeof window !== 'undefined' && window.openMediaModal) {
              e.preventDefault();
              window.openMediaModal(item.id, isMovie ? 'movie' : 'tv', true);
              isOpen = false;
            }
          }}
        >
          <img
            src={`https://image.tmdb.org/t/p/w92${item.poster_path}`}
            alt={title}
            width="36"
            height="54"
          />
          <div class="result-info">
            <span class="result-title">{title}</span>
            <span class="result-meta">{isMovie ? 'Movie' : 'Series'} {year ? `· ${year}` : ''}</span>
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>

<style>
  .sh-quick-search {
    position: relative;
    width: 100%;
    max-width: 380px;
  }
  .input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }
  .search-icon {
    position: absolute;
    left: 12px;
    font-size: 14px;
    opacity: 0.6;
    pointer-events: none;
  }
  input {
    width: 100%;
    padding: 9px 36px 9px 36px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    color: var(--text, #fff);
    font-size: 13px;
    outline: none;
    transition: border-color 0.2s, background 0.2s;
  }
  input:focus {
    background: rgba(255, 255, 255, 0.1);
    border-color: var(--purple, #9d4edd);
  }
  .clear-btn {
    position: absolute;
    right: 10px;
    background: none;
    border: none;
    color: var(--text-3, #888);
    cursor: pointer;
    font-size: 12px;
    padding: 4px;
  }
  .spinner {
    position: absolute;
    right: 12px;
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.2);
    border-top-color: var(--purple, #9d4edd);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .results-dropdown {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    right: 0;
    background: #14141f;
    border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
    border-radius: 12px;
    box-shadow: 0 16px 36px rgba(0, 0, 0, 0.6);
    overflow: hidden;
    z-index: 100;
  }
  .result-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    color: inherit;
    text-decoration: none;
    transition: background 0.15s;
  }
  .result-item:hover {
    background: rgba(157, 78, 221, 0.15);
  }
  .result-item img {
    border-radius: 6px;
    object-fit: cover;
  }
  .result-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .result-title {
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .result-meta {
    font-size: 11px;
    color: var(--text-3, #7e8094);
  }
</style>
