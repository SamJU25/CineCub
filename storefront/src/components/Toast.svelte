<script>
  /**
   * Toast.svelte — Svelte 5 Lightweight Micro-Toast Island
   */
  import { onMount } from 'svelte';

  let toasts = $state([]);

  function addToast(message, type = 'info', duration = 3000) {
    const id = Date.now() + Math.random();
    const item = { id, message, type };
    toasts = [...toasts, item];

    setTimeout(() => {
      removeToast(id);
    }, duration);
  }

  function removeToast(id) {
    toasts = toasts.filter((t) => t.id !== id);
  }

  onMount(() => {
    window.showToast = (msg, type, dur) => addToast(msg, type, dur);

    const handleCustomToast = (e) => {
      if (e.detail && e.detail.message) {
        addToast(e.detail.message, e.detail.type || 'info', e.detail.duration || 3000);
      }
    };
    window.addEventListener('show-toast', handleCustomToast);

    return () => {
      window.removeEventListener('show-toast', handleCustomToast);
    };
  });
</script>

{#if toasts.length > 0}
  <div class="toast-container" aria-live="polite" role="status">
    {#each toasts as toast (toast.id)}
      <div
        class="toast-pill {toast.type}"
        onclick={() => removeToast(toast.id)}
        role="alert"
        tabindex="0"
        onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && removeToast(toast.id)}
      >
        <span class="toast-icon">
          {#if toast.type === 'success'}✓
          {:else if toast.type === 'error'}✕
          {:else}ℹ{/if}
        </span>
        <span class="toast-text">{toast.message}</span>
      </div>
    {/each}
  </div>
{/if}

<style>
  .toast-container {
    position: fixed;
    top: 24px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 10000;
    display: flex;
    flex-direction: column;
    gap: 8px;
    pointer-events: none;
    max-width: 90vw;
    width: max-content;
  }
  .toast-pill {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 10px;
    background: rgba(18, 18, 28, 0.95);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(157, 78, 221, 0.4);
    color: #fff;
    font-size: 13px;
    font-weight: 700;
    padding: 10px 18px;
    border-radius: 999px;
    box-shadow: 0 12px 36px rgba(0, 0, 0, 0.6);
    cursor: pointer;
    animation: toastPop 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    transition: transform 0.15s, opacity 0.15s;
  }
  .toast-pill:hover {
    transform: scale(1.02);
  }
  .toast-pill.success {
    border-color: rgba(78, 221, 157, 0.5);
  }
  .toast-pill.success .toast-icon {
    color: #4ed99d;
  }
  .toast-pill.error {
    border-color: rgba(255, 59, 48, 0.5);
  }
  .toast-pill.error .toast-icon {
    color: #ff3b30;
  }
  .toast-icon {
    color: var(--purple, #9d4edd);
    font-weight: 900;
    font-size: 14px;
  }
  .toast-text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  @keyframes toastPop {
    from {
      transform: translateY(-16px) scale(0.95);
      opacity: 0;
    }
    to {
      transform: translateY(0) scale(1);
      opacity: 1;
    }
  }
</style>
