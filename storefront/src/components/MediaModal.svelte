<script>
  /**
   * MediaModal.svelte — Svelte 5 Interactive Video Player & Media Details Modal
   * Designed for high performance, smooth 60fps animations, and 100% responsive mobile layout.
   */
  import { onMount } from 'svelte';

  let isOpen = $state(false);
  let mediaId = $state(null);
  let mediaType = $state('movie'); // 'movie' | 'tv'
  let mediaData = $state(null);
  let currentServer = $state(0);
  let season = $state(1);
  let episode = $state(1);
  let totalSeasons = $state(1);
  let episodeList = $state([]);
  let isEpisodesLoading = $state(false);
  let isPlayerActive = $state(false);

  const SERVERS = [
    {
      name: 'Server 1 (VidLink)',
      movie: (id) => `https://vidlink.pro/movie/${id}?primaryColor=9d4edd&secondaryColor=14141f&iconColor=ffffff&autoplay=false`,
      tv: (id, s, e) => `https://vidlink.pro/tv/${id}/${s}/${e}?primaryColor=9d4edd&secondaryColor=14141f&iconColor=ffffff&autoplay=false`
    },
    {
      name: 'Server 2 (VidSrc)',
      movie: (id) => `https://vidsrc.me/embed/movie?tmdb=${id}`,
      tv: (id, s, e) => `https://vidsrc.me/embed/tv?tmdb=${id}&season=${s}&episode=${e}`
    },
    {
      name: 'Server 3 (AutoEmbed)',
      movie: (id) => `https://autoembed.co/movie/tmdb/${id}`,
      tv: (id, s, e) => `https://autoembed.co/tv/tmdb/${id}-${s}-${e}`
    },
    {
      name: 'Server 4 (MultiEmbed)',
      movie: (id) => `https://multiembed.mov/?video_id=${id}&tmdb=1`,
      tv: (id, s, e) => `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}`
    },
    {
      name: 'Server 5 (CineSrc)',
      movie: (id) => `https://cinesrc.st/embed/movie/${id}?color=%239d4edd&autoplay=false`,
      tv: (id, s, e) => `https://cinesrc.st/embed/tv/${id}?s=${s}&e=${e}&color=%239d4edd&autoplay=false`
    },
    {
      name: 'Server 6 (VidCore)',
      movie: (id) => `https://vidcore.org/embed/movie/${id}`,
      tv: (id, s, e) => `https://vidcore.org/embed/series/${id}/${s}/${e}`
    }
  ];

  let currentStreamUrl = $derived.by(() => {
    if (!mediaId) return '';
    const srv = SERVERS[currentServer] || SERVERS[0];
    return mediaType === 'tv'
      ? srv.tv(mediaId, season, episode)
      : srv.movie(mediaId);
  });

  let isBookmarked = $state(false);

  function checkBookmark() {
    if (!mediaId) {
      isBookmarked = false;
      return;
    }
    try {
      const store = JSON.parse(localStorage.getItem('sh_watchlist_store') || '[]');
      isBookmarked = Array.isArray(store) && store.some((item) => item.id === mediaId);
    } catch (e) {
      isBookmarked = false;
    }
  }

  function toggleBookmark() {
    if (!mediaId || !mediaData) return;
    try {
      const store = JSON.parse(localStorage.getItem('sh_watchlist_store') || '[]');
      const title = mediaData.title || mediaData.name;
      const year = (mediaData.release_date || mediaData.first_air_date || '').slice(0, 4);
      let updated = [];

      if (isBookmarked) {
        updated = store.filter((item) => item.id !== mediaId);
        isBookmarked = false;
      } else {
        updated = [
          {
            id: mediaId,
            type: mediaType,
            title,
            year,
            poster: mediaData.poster_path,
            addedAt: Date.now()
          },
          ...store.filter((item) => item.id !== mediaId)
        ];
        isBookmarked = true;
      }

      localStorage.setItem('sh_watchlist_store', JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('watchlist-updated'));
    } catch (e) {
      console.error('[MediaModal] failed to toggle bookmark:', e);
    }
  }

  function selectServer(idx) {
    currentServer = idx;
    try {
      localStorage.setItem('sh_preferred_server', String(idx));
    } catch (e) {}
  }

  function shareMedia() {
    if (!mediaData) return;
    const title = mediaData.title || mediaData.name;
    const url = `${window.location.origin}/?watch=${mediaId}&type=${mediaType}`;
    const text = `Watch ${title} on StreamHeaven!`;

    if (typeof window !== 'undefined' && window.AndroidShare && typeof window.AndroidShare.share === 'function') {
      window.AndroidShare.share(title, text, url);
    } else if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({ title, text, url }).catch(() => {});
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(url);
      alert('Link copied to clipboard!');
    }
  }

  function nextEpisode() {
    if (mediaType !== 'tv') return;
    const nextEpNum = episode + 1;
    const exists = episodeList.some((ep) => ep.episode_number === nextEpNum);
    if (exists) {
      episode = nextEpNum;
      isPlayerActive = true;
    } else if (season < totalSeasons) {
      season += 1;
      episode = 1;
      loadEpisodes(season);
      isPlayerActive = true;
    }
  }

  async function open(id, type = 'movie', startPlaying = true) {
    mediaId = id;
    mediaType = type === 'tv' || type === 'series' ? 'tv' : 'movie';
    try {
      const savedServer = localStorage.getItem('sh_preferred_server');
      if (savedServer !== null) {
        currentServer = parseInt(savedServer, 10) || 0;
      }
    } catch (e) {}
    season = 1;
    episode = 1;
    isPlayerActive = startPlaying;
    isOpen = true;
    checkBookmark();

    document.body.style.overflow = 'hidden';

    try {
      const res = await fetch(`/api/tmdb/${mediaType === 'tv' ? 'tv' : 'movie'}/${id}?append_to_response=credits`);
      if (res.ok) {
        mediaData = await res.json();
        checkBookmark();
        if (mediaType === 'tv') {
          totalSeasons = mediaData.number_of_seasons || 1;
          loadEpisodes(season);
        }
      }
    } catch (e) {
      console.error('[MediaModal] fetch failed:', e);
    }
  }

  async function loadEpisodes(sNum) {
    if (!mediaId || mediaType !== 'tv') return;
    isEpisodesLoading = true;
    try {
      const res = await fetch(`/api/tmdb/tv/${mediaId}/season/${sNum}`);
      if (res.ok) {
        const data = await res.json();
        episodeList = data.episodes || [];
      }
    } catch (e) {
      console.error('[MediaModal] season fetch failed:', e);
    } finally {
      isEpisodesLoading = false;
    }
  }

  function close() {
    isOpen = false;
    mediaId = null;
    mediaData = null;
    isPlayerActive = false;
    isBookmarked = false;
    document.body.style.overflow = '';
  }

  function handleKeydown(e) {
    if (e.key === 'Escape' && isOpen) {
      close();
    }
  }

  onMount(() => {
    // Expose openMediaModal globally for deep-links and buttons
    window.openMediaModal = (id, type, startPlaying) => open(id, type, startPlaying);

    // Check for ?watch= in URL on initial mount
    const params = new URLSearchParams(window.location.search);
    const watchId = params.get('watch') || params.get('id') || params.get('play');
    if (watchId) {
      const parsed = parseInt(watchId, 10);
      if (!isNaN(parsed) && parsed > 0) {
        setTimeout(() => open(parsed, params.get('type') || 'movie', true), 300);
      }
    }

    // Intercept clicks on play links if desired
    const handleDocClick = (e) => {
      const playBtn = e.target.closest('[data-play-id]');
      if (playBtn) {
        e.preventDefault();
        const id = parseInt(playBtn.getAttribute('data-play-id'), 10);
        const type = playBtn.getAttribute('data-play-type') || 'movie';
        open(id, type, true);
      }
    };
    document.addEventListener('click', handleDocClick);

    return () => {
      document.removeEventListener('click', handleDocClick);
      document.body.style.overflow = '';
    };
  });
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <div class="modal-backdrop" onclick={close} role="presentation">
    <div class="modal-card" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
      <button class="btn-close" onclick={close} aria-label="Close modal">✕</button>

      <!-- Player Frame -->
      <div class="player-container">
        {#if isPlayerActive && currentStreamUrl}
          <iframe
            src={currentStreamUrl}
            title="Video Player"
            allowfullscreen
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            referrerpolicy="no-referrer"
          ></iframe>
        {:else if mediaData?.backdrop_path}
          <div
            class="player-placeholder"
            style={`background-image: url('https://image.tmdb.org/t/p/w1280${mediaData.backdrop_path}')`}
          >
            <button class="btn-start-play" onclick={() => (isPlayerActive = true)}>
              ▶ Watch Now
            </button>
          </div>
        {:else}
          <div class="player-loading">
            <span class="spinner"></span>
          </div>
        {/if}
      </div>

      <!-- Controls & Server Selection -->
      <div class="modal-content">
        <div class="server-bar">
          <span class="server-label">Servers:</span>
          <div class="server-chips">
            {#each SERVERS as srv, idx}
              <button
                class="server-chip"
                class:active={currentServer === idx}
                onclick={() => selectServer(idx)}
              >
                {srv.name}
              </button>
            {/each}
          </div>
        </div>

        <!-- TV Show Episode & Season Selector -->
        {#if mediaType === 'tv' && totalSeasons > 0}
          <div class="tv-controls">
            <div class="tv-header-row">
              <div class="season-select-wrapper">
                <label for="season-select">Season:</label>
                <select
                  id="season-select"
                  bind:value={season}
                  onchange={() => {
                    episode = 1;
                    loadEpisodes(season);
                  }}
                >
                  {#each Array.from({ length: totalSeasons }, (_, i) => i + 1) as sNum}
                    <option value={sNum}>Season {sNum}</option>
                  {/each}
                </select>
              </div>
              <button class="btn-next-ep" onclick={nextEpisode} title="Jump to next episode">
                Next Episode ⏭
              </button>
            </div>

            {#if episodeList.length > 0}
              <div class="episodes-grid">
                {#each episodeList as ep}
                  <button
                    class="episode-btn"
                    class:active={episode === ep.episode_number}
                    onclick={() => {
                      episode = ep.episode_number;
                      isPlayerActive = true;
                    }}
                  >
                    EP {ep.episode_number}: {ep.name || `Episode ${ep.episode_number}`}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/if}

        <!-- Details Info -->
        {#if mediaData}
          <div class="info-section">
            <div class="title-row">
              <h2 class="title">{mediaData.title || mediaData.name}</h2>
              <div class="action-buttons">
                <button
                  class="btn-action btn-share"
                  onclick={shareMedia}
                  title="Share with friends"
                >
                  ↗ Share
                </button>
                <button
                  class="btn-action btn-bookmark"
                  class:saved={isBookmarked}
                  onclick={toggleBookmark}
                  title={isBookmarked ? 'Remove from Watchlist' : 'Add to Watchlist'}
                >
                  {isBookmarked ? '🔖 Saved' : '+ Watchlist'}
                </button>
              </div>
            </div>
            <div class="meta-row">
              {#if mediaData.release_date || mediaData.first_air_date}
                <span>{(mediaData.release_date || mediaData.first_air_date).slice(0, 4)}</span>
              {/if}
              {#if mediaData.vote_average}
                <span>★ {mediaData.vote_average.toFixed(1)}</span>
              {/if}
              {#if mediaData.runtime}
                <span>{Math.floor(mediaData.runtime / 60)}h {mediaData.runtime % 60}m</span>
              {/if}
            </div>
            {#if mediaData.overview}
              <p class="overview">{mediaData.overview}</p>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: rgba(4, 4, 8, 0.88);
    backdrop-filter: blur(16px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: clamp(8px, 2vw, 24px);
    animation: fadeIn 0.2s ease-out;
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  .modal-card {
    position: relative;
    width: 100%;
    max-width: 1000px;
    max-height: 94vh;
    max-height: 94dvh;
    background: #101018;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 18px;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.8);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .btn-close {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 10;
    background: rgba(0, 0, 0, 0.65);
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.2);
    width: 34px;
    height: 34px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 15px;
    transition: background 0.2s, transform 0.2s;
  }
  .btn-close:hover {
    background: rgba(255, 255, 255, 0.2);
    transform: scale(1.08);
  }
  .player-container {
    width: 100%;
    aspect-ratio: 16 / 9;
    background: #000;
    position: relative;
  }
  iframe {
    width: 100%;
    height: 100%;
    border: none;
    display: block;
  }
  .player-placeholder {
    width: 100%;
    height: 100%;
    background-size: cover;
    background-position: center;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }
  .player-placeholder::before {
    content: '';
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
  }
  .btn-start-play {
    position: relative;
    z-index: 2;
    background: linear-gradient(135deg, #7b2cbf, #9d4edd);
    color: #fff;
    font-weight: 800;
    font-size: 17px;
    padding: 14px 32px;
    border-radius: 14px;
    border: none;
    cursor: pointer;
    box-shadow: 0 8px 32px rgba(157, 78, 221, 0.5);
    transition: transform 0.2s, filter 0.2s;
  }
  .btn-start-play:hover {
    filter: brightness(1.15);
    transform: scale(1.04);
  }
  .player-loading {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .spinner {
    width: 36px;
    height: 36px;
    border: 3px solid rgba(255, 255, 255, 0.15);
    border-top-color: #9d4edd;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .modal-content {
    padding: clamp(14px, 3vw, 24px);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .server-bar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }
  .server-label {
    font-size: 12px;
    font-weight: 700;
    color: #a5a6b8;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .server-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .server-chip {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #e8e8f0;
    padding: 6px 12px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }
  .server-chip:hover {
    background: rgba(255, 255, 255, 0.12);
  }
  .server-chip.active {
    background: rgba(157, 78, 221, 0.25);
    border-color: #9d4edd;
    color: #fff;
  }
  .tv-controls {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.06);
  }
  .season-select-wrapper {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
  }
  select {
    background: #1a1a26;
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.15);
    padding: 6px 12px;
    border-radius: 8px;
    font-size: 13px;
    outline: none;
  }
  .episodes-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 8px;
    max-height: 150px;
    overflow-y: auto;
  }
  .episode-btn {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: #d1d1e0;
    font-size: 11px;
    font-weight: 600;
    padding: 8px;
    border-radius: 6px;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
  }
  .episode-btn:hover {
    background: rgba(255, 255, 255, 0.12);
  }
  .episode-btn.active {
    background: rgba(157, 78, 221, 0.25);
    border-color: #9d4edd;
    color: #fff;
  }
  .info-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .title {
    font-size: clamp(16px, 2.5vw, 22px);
    font-weight: 800;
    color: #fff;
  }
  .tv-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .btn-next-ep {
    background: rgba(157, 78, 221, 0.15);
    border: 1px solid rgba(157, 78, 221, 0.35);
    color: #c77dff;
    font-size: 11px;
    font-weight: 700;
    padding: 5px 12px;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.15s;
  }
  .btn-next-ep:hover {
    background: rgba(157, 78, 221, 0.3);
  }
  .action-buttons {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .btn-action {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #e8e8f0;
    font-size: 12px;
    font-weight: 700;
    padding: 6px 14px;
    border-radius: 999px;
    cursor: pointer;
    transition: background 0.18s, border-color 0.18s, color 0.18s;
  }
  .btn-action:hover {
    background: rgba(157, 78, 221, 0.2);
    border-color: #9d4edd;
  }
  .btn-bookmark.saved {
    background: rgba(157, 78, 221, 0.25);
    border-color: #9d4edd;
    color: #c77dff;
  }
  .meta-row {
    display: flex;
    gap: 12px;
    font-size: 13px;
    color: #a5a6b8;
    font-weight: 600;
  }
  .overview {
    font-size: 13px;
    color: #b5b6c8;
    line-height: 1.5;
  }
</style>
