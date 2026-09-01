<script>
  /**
   * InstallBanner.svelte — Svelte 5 Non-Intrusive PWA / Native APK Install Island
   */
  import { onMount } from 'svelte';

  let isVisible = $state(false);
  let deferredPrompt = $state(null);
  let isAndroid = $state(false);

  function dismiss() {
    isVisible = false;
    try {
      localStorage.setItem('sh_install_banner_dismissed', String(Date.now()));
    } catch (e) {}
  }

  async function handleInstall() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        dismiss();
      }
      deferredPrompt = null;
    } else if (isAndroid) {
      window.location.href = '/StreamHeaven.apk';
    } else {
      alert('To install StreamHeaven: tap your browser menu and select "Add to Home Screen".');
      dismiss();
    }
  }

  onMount(() => {
    // Check if running inside standalone PWA or native app
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    const isAppEnv = document.documentElement.classList.contains('is-app-env') || Boolean(window.AndroidShare);

    if (isStandalone || isAppEnv) {
      return;
    }

    // Check if dismissed in last 7 days
    try {
      const dismissed = localStorage.getItem('sh_install_banner_dismissed');
      if (dismissed && Date.now() - parseInt(dismissed, 10) < 7 * 86400 * 1000) {
        return;
      }
    } catch (e) {}

    const ua = navigator.userAgent || '';
    isAndroid = /android/i.test(ua);
    const isMobile = /android|iphone|ipad|ipod/i.test(ua);

    if (isMobile) {
      // Small delay so it appears smoothly after initial load
      setTimeout(() => {
        isVisible = true;
      }, 2500);
    }

    const beforeInstallHandler = (e) => {
      e.preventDefault();
      deferredPrompt = e;
      isVisible = true;
    };
    window.addEventListener('beforeinstallprompt', beforeInstallHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', beforeInstallHandler);
    };
  });
</script>

{#if isVisible}
  <div class="install-banner" role="banner" aria-label="Install App Banner">
    <div class="banner-inner">
      <img src="/assets/images/favicon-48x48.png" alt="StreamHeaven Icon" width="40" height="40" class="app-icon" />
      <div class="banner-text">
        <span class="app-name">StreamHeaven App</span>
        <span class="app-tagline">Fast HD Streaming & Offline Sync</span>
      </div>
      <div class="banner-actions">
        <button class="btn-install" onclick={handleInstall}>
          {isAndroid ? 'Get APK' : 'Install'}
        </button>
        <button class="btn-dismiss" onclick={dismiss} aria-label="Dismiss banner">✕</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .install-banner {
    position: fixed;
    bottom: 16px;
    left: 16px;
    right: 16px;
    z-index: 9000;
    max-width: 480px;
    margin: 0 auto;
    background: rgba(18, 18, 28, 0.95);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(157, 78, 221, 0.35);
    border-radius: 16px;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.7);
    padding: 12px 14px;
    animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }
  @keyframes slideUp {
    from {
      transform: translateY(100%);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
  .banner-inner {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .app-icon {
    border-radius: 10px;
    flex-shrink: 0;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  }
  .banner-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
  }
  .app-name {
    font-size: 14px;
    font-weight: 800;
    color: #fff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .app-tagline {
    font-size: 11px;
    color: var(--text-2, #a5a6b8);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .banner-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }
  .btn-install {
    background: linear-gradient(135deg, var(--purple-deep, #7b2cbf), var(--purple, #9d4edd));
    color: #fff;
    font-size: 12px;
    font-weight: 800;
    padding: 8px 16px;
    border-radius: 10px;
    border: none;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(123, 44, 191, 0.4);
    transition: transform 0.15s;
  }
  .btn-install:hover {
    transform: scale(1.04);
  }
  .btn-dismiss {
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-3, #7e8094);
    border: none;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 12px;
    transition: background 0.15s, color 0.15s;
  }
  .btn-dismiss:hover {
    background: rgba(255, 255, 255, 0.15);
    color: #fff;
  }
</style>
