/// <reference types="@cloudflare/workers-types" />

export interface Env {
  APP_URL?: string;
  GO_BACKEND_URL?: string;
  RENDER_BASE_URL?: string;
  STREAMS?: KVNamespace;
}

declare global {
  interface ExecutionContext {
    waitUntil(promise: Promise<unknown>): void;
  }
}
