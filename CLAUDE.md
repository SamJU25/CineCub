# Agent Instructions

> This file is mirrored across CLAUDE.md, AGENTS.md, and GEMINI.md so the same instructions load in any AI environment.

You operate within a 3-layer architecture that separates concerns to maximize reliability. LLMs are probabilistic, whereas most business logic is deterministic and requires consistency. This system fixes that mismatch.

## The 3-Layer Architecture

**Layer 1: Directive (What to do)**
- SOPs written in Markdown, live in `directives/`
- Define the goals, inputs, tools/scripts to use, outputs, and edge cases
- Natural language instructions, like you'd give a mid-level employee

**Layer 2: Orchestration (Decision making)**
- This is you. Your job: intelligent routing.
- Read directives, call execution tools in the right order, handle errors, ask for clarification, update directives with learnings

**Layer 3: Execution (Doing the work)**
- Deterministic Python scripts in `execution/`
- Environment variables and API tokens stored in `.env`
- Reliable, testable, fast. Use scripts instead of manual work.

**Why this works:** if you do everything yourself, errors compound. 90% accuracy per step = 59% success over 5 steps. Push complexity into deterministic code.

## Operating Principles

**1. Check for tools first** — before writing a script, check `execution/`. Only create new scripts if none exist.

**2. Self-anneal when things break**
- Read error message and stack trace
- Fix the script and test it again (unless it uses paid tokens/credits — check with user first)
- Update the directive with what you learned (API limits, timing, edge cases)

**3. Update directives as you learn** — directives are living documents. Don't create or overwrite them without asking unless explicitly told to.

## Self-annealing loop
1. Fix it → 2. Update the tool → 3. Test → 4. Update directive → 5. System is now stronger

---

## StreamHeaven — Project Context

This is a streaming platform monorepo. Read `ARCHITECTURE.md` for the full technical reference.

### Stack at a glance

| Layer | Folder | Host | Deploy |
|---|---|---|---|
| Storefront (Next.js 16 + React 19) | `frontend/next-storefront/` | Cloudflare Workers (`cinecub-next`) | `npm run deploy` |
| Edge Worker (TypeScript) | `backend-edge/` | Cloudflare Workers | `npm run deploy` |
| Backend API (Go) | `backend/` | Render / VPS | push to `main` |
| Android app (Kotlin) | `frontend/android-app/` | Google Play | tag `v*` |

### Key architecture facts
- **Ad-free playback** fetches from `https://steamheaven.onrender.com/api/streams/` — NOT the edge worker
- **Render sleeps** after ~15 min idle; the edge Worker pings `/api/health` every 10 min to keep it awake
- **4KHDHub is blocked** at the edge worker (Cloudflare egress 1106) but resolves fine via Render
- **`prioritizeFileStreams()`** in `frontend/next-storefront/src/components/Player.tsx` sorts native MP4/MKV sources first so they auto-play
- **HLS** → Hls.js; **MP4/MKV** → native `<video>`; both routed through `/m3u8-proxy` and `/ts-proxy` on Render
- **Custom dropdowns contract**: `.custom-select` requires `.select-hide { display: none !important; }` and `.select-items { position: absolute; max-height: 280px; overflow-y: auto; }`. On desktop, filter dropdown containers (`.browse-filters-wrap`) must use `flex-wrap: nowrap; flex-shrink: 0;` to prevent adjacent comboboxes from collapsing into a vertical stack; confine `flex-wrap: wrap` to mobile media queries. Never omit or drop these global rules when styling components.

### Skills (read these before working on the relevant area)

**StreamHeaven Platform Skills:**
- `.agents/skills/streamheaven-algorithms/` — source ranking, adaptive server selection, gesture arbitration, token-bucket rate limiting
- `.agents/skills/streamheaven-bug-hunting/` — systematic bug finding, root-cause analysis, and headless simulation
- `.agents/skills/streamheaven-deploy-sync/` — deploying all three layers, health checks
- `.agents/skills/streamheaven-edge-worker/` — Cloudflare Worker, scrapers, KV/R2, Wrangler
- `.agents/skills/streamheaven-player-optimization/` — player logic, HLS, source sorting
- `.agents/skills/streamheaven-stream-diagnostics/` — debugging streams, scraper errors, CORS

**Frontend & Mobile Engineering:**
- `.agents/skills/nextjs-developer/` & `.agents/skills/nextjs-app-router-patterns/` — Next.js 16 App Router, OpenNext on Cloudflare
- `.agents/skills/react-expert/` — React 19, hooks, component lifecycle, memoization
- `.agents/skills/typescript-pro/` & `.agents/skills/coding-standards/` — TypeScript type safety and coding standards
- `.agents/skills/tailwind-design-system/`, `.agents/skills/ui-design/`, `.agents/skills/frontend-design/` — UI tokens, dark mode, design polish
- `.agents/skills/kotlin-specialist/` — Android Kotlin development for CineCub app

**Backend & Systems (Go & Cloudflare Workers):**
- `.agents/skills/golang-pro/` & `.agents/skills/go-concurrency-patterns/` — Go 1.24 idioms, Chi routing, goroutines, worker pools
- `.agents/skills/backend-patterns/` & `.agents/skills/api-design-principles/` — API idempotency, caching, streaming, rate limiting
- `.agents/skills/auth-implementation-patterns/` — JWT, session management, password hashing

**Quality, Reliability & Tools:**
- `.agents/skills/graphify/` — AST knowledge graph extraction, community detection, and topological queries
- `.agents/skills/smart-file-code-organizer/` — monorepo organization and layer boundary defense
- `.agents/skills/verification-loop/` — quality gates: build, typecheck, lint, test before PR/deploy
- `.agents/skills/tdd-workflow/` — test-driven development workflow
- `.agents/skills/debugging-strategies/` — methodical isolation and root cause analysis
- `.agents/skills/code-optimizer/` & `.agents/skills/performance-engineer/` — full-stack latency and performance profiling
- `.agents/skills/security-review/` — security review, secrets hygiene, injection & CORS defense
- `.agents/skills/webapp-testing/` — Playwright testing for storefront UI
- `.agents/skills/torrentclaw/` — Torrent search and media distribution
- `.agents/skills/seo-technical/` — Technical SEO, metadata, sitemaps, robots.txt
- `.agents/skills/antigravity-skills-manager/` — Skills discovery and management

### Knowledge graph
- `graphify-out/graph.json` — run `/graphify query "<question>"` to query the codebase graph
- Run `python -m graphify update .` after modifying code to keep the graph current

### File organization
- `.tmp/` — all intermediate files. Never commit, always regenerated.
- `execution/` — Python scripts (the deterministic tools)
- `directives/` — SOPs in Markdown (the instruction set)
- `.env` — environment variables and API keys (gitignored)
- `.agents/` — AI skills, rules, and workflows (the single source of truth for agent config)

## Summary

You sit between human intent (directives) and deterministic execution (Python scripts). Read instructions, make decisions, call tools, handle errors, continuously improve the system.

Be pragmatic. Be reliable. Self-anneal.
