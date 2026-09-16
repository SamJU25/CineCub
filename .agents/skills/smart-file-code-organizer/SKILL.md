---
name: smart-file-code-organizer
description: Monorepo file organization, directory architecture, clean code structure, modular separation, dead code elimination, and asset hygiene across StreamHeaven and full-stack web/mobile projects. Make sure to use this skill whenever restructuring directories, moving files, refactoring bloated components, managing monorepo layer boundaries, decluttering repositories, eliminating circular dependencies, or organizing static assets.
---

# Smart File & Code Organizer

A master architectural guide for organizing monorepo directories, maintaining clean code boundaries, refactoring monolithic files, eliminating dead code, and enforcing asset hygiene.

---

## 1. StreamHeaven Monorepo Architecture & Layer Boundaries

StreamHeaven is structured as a multi-tier monorepo where each layer has a single responsibility and strict deployment target.

```text
StreamHeaven/
├── frontend/
│   ├── storefront/         # Astro + Svelte storefront (Cloudflare Workers)
│   │   ├── public/         # Static assets, script.js, style.css, sw.js
│   │   └── src/            # Astro pages, Svelte components, layouts
│   └── android-app/        # Native Android Kotlin app with integrated WebView
├── backend-edge/           # Cloudflare Worker (TypeScript API, KV/R2 caching, scrapers)
│   ├── src/
│   │   ├── providers/      # Scrapers (vidsrc, vidlink, flixhq, etc.)
│   │   └── routes/         # Edge REST API endpoints
│   └── wrangler.toml       # Cloudflare Worker configuration
├── backend/                # Go media streaming proxy (Render / VPS)
│   ├── api/                # HLS & TS segment proxy, CORS handlers
│   └── main.go             # Entrypoint
├── directives/             # Layer 1: SOPs and operational runbooks (Markdown)
├── execution/              # Layer 3: Deterministic Python execution scripts
├── .agents/                # AI Agent intelligence: skills, rules, workflows
├── .tmp/                   # Ephemeral intermediate scratch files (gitignored)
└── graphify-out/           # Codebase knowledge graph & AST dependency map
```

### Layer Boundary Rules
1. **Never leak secrets across tiers**:
   - `backend-edge/` uses Cloudflare secrets via `wrangler secret put` or `.dev.vars`.
   - `backend/` uses `.env`.
   - `frontend/storefront/` client scripts (`public/script.js`) must NEVER contain private API keys.
2. **Never cross-import across different build boundaries**:
   - `backend-edge/` cannot import from `frontend/storefront/` or vice versa; communicate strictly via typed HTTP/JSON contracts.
3. **Keep deterministic tools in `execution/`**:
   - Complex multi-step operations (e.g. bulk scraping tests, health audits) belong in testable Python scripts in `execution/`, not manual copy-paste commands.

---

## 2. Directory Hygiene & The 3-Layer System

### File Organization Matrix

| Directory | Purpose | Commit to Git? | Cleanup Cadence |
|---|---|---|---|
| `directives/` | SOPs, business directives, workflow manuals | ✅ Yes | Living document; update on process changes |
| `execution/` | Reusable deterministic Python scripts | ✅ Yes | Maintained as first-class code |
| `.agents/` | Skills, custom rules, agent prompts | ✅ Yes | Updated as platform evolves |
| `.tmp/` | Temporary scratch files, raw scrapes, diffs | ❌ NEVER | Auto-regenerated or wiped |
| `.env`, `.dev.vars` | Secrets, API tokens, credentials | ❌ NEVER | Strictly gitignored |
| `dist/`, `.astro/` | Compiled production bundles | ❌ NEVER | Built on CI/deploy |

---

## 3. File Naming & Component Co-Location Conventions

1. **JavaScript & TypeScript**:
   - Utility modules & helpers: `kebab-case.js` or `kebab-case.ts` (e.g. `source-ranker.js`, `stream-parser.ts`).
   - Classes & components: `PascalCase.svelte` or `PascalCase.astro` (e.g. `MediaModal.svelte`, `WatchCard.astro`).
2. **Go Backend**:
   - `lowercase.go` with descriptive filenames (e.g. `proxy.go`, `handlers.go`, `stream.go`).
3. **Stylesheets**:
   - Global design system tokens in `style.css`.
   - Scoped component styles embedded inside Svelte `<style>` blocks.
4. **Asset Files**:
   - Static images: lowercase with hyphens: `logo-icon.png`, `hero-backdrop-default.webp`.
   - Place media assets inside `frontend/storefront/public/assets/images/` or `assets/icons/`.

---

## 4. Refactoring Bloated & Monolithic Code

When a file grows beyond 800–1000 lines (or accumulates too many responsibilities):

### Strategy: Namespace Extraction
Do not break working code by blindly rewriting it. Extract cohesive domain modules:

```javascript
// Before: Massive monolithic script.js containing everything

// After: Domain-focused sub-modules under a clear namespace
window.StreamHeaven = window.StreamHeaven || {};

// 1. UI & Controls Module
window.StreamHeaven.PlayerUI = {
  updateTime: function() { ... },
  toggleControls: function() { ... }
};

// 2. Stream Ranking & Prioritization Module
window.StreamHeaven.SourceEngine = {
  prioritizeFileStreams: function(sources) { ... },
  rankStreams: function(sources) { ... }
};

// 3. Gesture & Touch Controller
window.StreamHeaven.GestureController = {
  initDoubleTap: function() { ... }
};
```

### Dependency Graph & Circular Dependency Defense
- High-level orchestrators may import low-level utilities, but low-level utilities must NEVER import high-level orchestrators.
- If Module A needs Module B, and Module B needs Module A, extract the shared data types or helper function into a standalone Module C (`types.js` or `utils.js`).

---

## 5. Dead Code & Asset Decluttering Protocol

Perform periodic sweeps to keep the codebase lean and lightning-fast:

1. **Unused CSS Selectors**:
   - When UI components are removed or redesigned (e.g. header quality dropdown), remove or mark legacy classes so stylesheet size remains minimal.
2. **Orphaned Assets**:
   - Check `public/assets/` against references in `index.html`, `script.js`, and Svelte components.
   - Delete unused demo PNGs or old icons.
3. **Stale Endpoints & Scrapers**:
   - Scrapers that permanently fail (e.g. discontinued domains) should be disabled or retired into an `archive/` folder rather than running on every user request.
4. **Service Worker Cache List**:
   - When deleting an asset, immediately remove it from `urlsToCache` in `sw.js` to prevent 404 cache installation errors.

---

## 6. Code Organization Checklist (Before Committing)

- [ ] Are files placed in their correct monorepo layer (`storefront`, `backend-edge`, `backend`)?
- [ ] Are all secrets, tokens, and temporary files excluded from git staging?
- [ ] Are new files named according to kebab-case (scripts/modules) or PascalCase (components)?
- [ ] Has dead code from previous implementations been cleaned up?
- [ ] Has `python -m graphify update .` been executed to keep the knowledge graph synchronized?
