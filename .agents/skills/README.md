# 🛠️ CineCub Agent Skills Directory

All skills for the CineCub / StreamHeaven platform are unified and organized here in `.agents/skills/`.

Each skill is self-contained in its own directory with a standard `SKILL.md` instruction file and supporting references.

Additionally, the full 300+ skill catalog from `rmyndharis/antigravity-skills` is installed globally as an Antigravity plugin at `~/.gemini/config/plugins/antigravity-skills` and manageable via `antigravity-skills-manager`.

---

## 📂 Skill Catalog by Category

### 1. 🎬 StreamHeaven Streaming Platform Skills
Specialized domain knowledge for video playback, streaming proxies, scrapers, and edge deployment:

- [**`streamheaven-player-optimization`**](./streamheaven-player-optimization/SKILL.md): Video playback pipeline (`PlayerModal.tsx`, `Hls.js`, `<video>`), source sorting, audio track handling, and touch gesture controls.
- [**`streamheaven-algorithms`**](./streamheaven-algorithms/SKILL.md): Core algorithms for stream ranking, adaptive server fallback, touch gesture arbitration, and token-bucket rate limiting.
- [**`streamheaven-stream-diagnostics`**](./streamheaven-stream-diagnostics/SKILL.md): Media scraper debugging, Cloudflare HTTP 1106 blocks, `/m3u8-proxy` & `/ts-proxy` validation, and CORS troubleshooting.
- [**`streamheaven-bug-hunting`**](./streamheaven-bug-hunting/SKILL.md): Systematic root-cause analysis across Next.js Storefront, Cloudflare Workers, and Go media proxy.
- [**`streamheaven-edge-worker`**](./streamheaven-edge-worker/SKILL.md): Cloudflare Worker gateway (`backend-edge/`), caching rules, KV/R2 bindings, keep-alive crons, and APK distribution.
- [**`streamheaven-deploy-sync`**](./streamheaven-deploy-sync/SKILL.md): Deployment pipeline, cross-layer sync, health checks, and production readiness verification.

---

### 2. ⚡ Full-Stack Engineering & Quality Skills
Architecture, coding standards, performance, security, and verification:

- [**`nextjs-app-router-patterns`**](./nextjs-app-router-patterns/SKILL.md): Next.js App Router idioms, React Server Components, server actions, route handlers, dynamic routes, and caching layers.
- [**`frontend-patterns`**](./frontend-patterns/SKILL.md): Next.js 16, React 19, Zustand state architecture, SSR data fetching, and component design.
- [**`golang-pro`**](./golang-pro/SKILL.md): Advanced Go 1.24 idioms, interface design, standard library patterns, error handling, and high-performance server construction.
- [**`go-concurrency-patterns`**](./go-concurrency-patterns/SKILL.md): Goroutines, channels, sync primitives, worker pools, fan-out/fan-in, and context timeouts.
- [**`backend-patterns`**](./backend-patterns/SKILL.md): RESTful API architecture, caching strategies, rate limiting, and Go/Workers backend design.
- [**`auth-implementation-patterns`**](./auth-implementation-patterns/SKILL.md): PBKDF2 cryptography, JWT stateless tokens, session rotation, D1 SQL auth, and token expiration.
- [**`api-design-principles`**](./api-design-principles/SKILL.md): API idempotency, versioning, consistent error envelopes, rate limiting headers, and contract design.
- [**`coding-standards`**](./coding-standards/SKILL.md): TypeScript, JavaScript, and Go best practices, clean code, immutability, and maintainability.
- [**`typescript-advanced-types`**](./typescript-advanced-types/SKILL.md): Generics, mapped types, conditional types, template literal types, and type-level safety.
- [**`ui-design`**](./ui-design/SKILL.md): Obsidian dark mode palette, glassmorphism, responsive mobile layouts, 120fps touch gestures, and accessibility.
- [**`frontend-design`**](./frontend-design/SKILL.md): Distinctive, intentional UI/UX direction, anti-cliché design principles, bespoke aesthetics, typography discipline, and copywriting intentionality (Anthropic official).
- [**`tailwind-design-system`**](./tailwind-design-system/SKILL.md): Tailwind design tokens, typography, gradients, components, and responsive utility architecture.
- [**`seo-optimization`**](./seo-optimization/SKILL.md): Technical SEO, dynamic OpenGraph/Twitter cards, Schema.org JSON-LD structured data, and dynamic TMDB sitemaps.
- [**`security-review`**](./security-review/SKILL.md): Vulnerability defense, secret sanitization, SQL/injection safety, and CORS configuration.
- [**`code-optimizer`**](./code-optimizer/SKILL.md): Performance profiling, bundle reduction, lazy loading, and latency optimization.
- [**`performance-engineer`**](./performance-engineer/SKILL.md): Latency profiling, Core Web Vitals (LCP, CLS, INP), memory leak hunting, and caching topologies.
- [**`debugging-strategies`**](./debugging-strategies/SKILL.md): Methodical isolation, binary search debugging, logging strategies, and state snapshotting.
- [**`tdd-workflow`**](./tdd-workflow/SKILL.md): Test-driven development workflow (Red-Green-Refactor) for unit, integration, and E2E tests.
- [**`verification-loop`**](./verification-loop/SKILL.md): Pre-deploy quality gates: typecheck, linting, test suites, and build verification.
- [**`smart-file-code-organizer`**](./smart-file-code-organizer/SKILL.md): Monorepo folder architecture, boundary enforcement, and dead code elimination.

---

### 3. 🧠 Memory, Continuous Learning & Tooling
Agent self-improvement, knowledge preservation, and workflow efficiency:

- [**`smart-memory`**](./smart-memory/SKILL.md): Long-term memory management, self-annealing learning loops, architectural gotchas, and insight retention.
- [**`continuous-learning`**](./continuous-learning/SKILL.md): Auto-evaluates sessions and extracts reusable debugging fixes and patterns into learned skills.
- [**`strategic-compact`**](./strategic-compact/SKILL.md): Proactive context compaction at logical task boundaries (after planning, before execution).
- [**`eval-harness`**](./eval-harness/SKILL.md): Evaluation framework for prompt regression testing, agent benchmarking, and pass@k metrics.
- [**`skill-creator`**](./skill-creator/SKILL.md): Tooling for creating, benchmarking, and optimizing agent skills.
- [**`skill-miner`**](./skill-miner/SKILL.md): Mines coding-agent history, transcripts, and repeated work to surface candidate skills with evidence.
- [**`skill-personalizer`**](./skill-personalizer/SKILL.md): Audits and adapts community/downloaded skills to local user habits, toolpaths, and project context.
- [**`skill-generalizer`**](./skill-generalizer/SKILL.md): Sanitizes, redacts private paths, and prepares local skills for public release on GitHub or marketplaces.
- [**`antigravity-skills-manager`**](./antigravity-skills-manager/SKILL.md): CLI and catalog manager for discovering, searching, and installing any of the 300+ skills in the Antigravity Skill Vault.


---

### 4. 🗺️ Knowledge Graph & Codebase Navigation
- [**`graphify`**](./graphify/SKILL.md): AST-based knowledge graph extraction, community clustering, God Node analysis, and topological queries (`graphify query`, `path`, `explain`).

---

### 5. 🛡️ Cybersecurity Operations & Defensive Security (22 Skills)
Complete collection of 22 production-grade cybersecurity skills from `Masriyan/Claude-Code-CyberSecurity-Skill` (with 35 automation scripts):

- [**`01-recon-osint`**](./01-recon-osint/SKILL.md): Reconnaissance, OSINT, DNS recon, subdomain enum, and technology fingerprinting.
- [**`02-vulnerability-scanner`**](./02-vulnerability-scanner/SKILL.md): Vulnerability assessment, dependency audits, config auditing, and CVSS v3.1/v4.0 scoring.
- [**`03-exploit-development`**](./03-exploit-development/SKILL.md): Authorized PoC development, buffer overflow/ROP templates, format strings, and payload generation.
- [**`04-reverse-engineering`**](./04-reverse-engineering/SKILL.md): Binary triage, ELF/PE/Mach-O analysis, assembly disassembly, decompilation, and firmware RE.
- [**`05-malware-analysis`**](./05-malware-analysis/SKILL.md): Static/dynamic analysis, YARA rule generation, sandbox profiling, and behavioral classification.
- [**`06-threat-hunting`**](./06-threat-hunting/SKILL.md): Threat hunting, IOC extraction, MITRE ATT&CK mapping, and Sigma detection rules.
- [**`07-incident-response`**](./07-incident-response/SKILL.md): Digital forensics and incident response (DFIR), NIST SP 800-61 / SANS PICERL playbooks, evidence collection, and timeline construction.
- [**`08-network-security`**](./08-network-security/SKILL.md): Network traffic analysis, PCAP inspection, Suricata/Snort rules, and firewall audit.
- [**`09-web-security`**](./09-web-security/SKILL.md): OWASP Top 10 testing, SQLi, XSS, SSRF, API security testing, and JWT/OAuth analysis.
- [**`10-cloud-security`**](./10-cloud-security/SKILL.md): AWS, Azure, GCP security auditing, Dockerfile/K8s hardening, and Terraform/IaC scanning.
- [**`11-csoc-automation`**](./11-csoc-automation/SKILL.md): CSOC alert triage, incident response playbook automation, escalation workflows, and shift KPI tracking.
- [**`12-log-analysis`**](./12-log-analysis/SKILL.md): Security log parsing (Syslog, EVTX, JSON), anomaly detection, SIEM query building (Splunk/KQL/EQL), and Sigma rules.
- [**`13-crypto-analysis`**](./13-crypto-analysis/SKILL.md): SSL/TLS auditing, cipher suite analysis, hash algorithm verification, and post-quantum cryptography (PQC) guidance.
- [**`14-red-team-ops`**](./14-red-team-ops/SKILL.md): Authorized red team engagement planning, C2 architecture design, AD attack paths, OPSEC, and reporting.
- [**`15-blue-team-defense`**](./15-blue-team-defense/SKILL.md): System hardening (Linux/Windows CIS baselines), detection engineering, and defense-in-depth architecture.
- [**`16-ai-llm-security`**](./16-ai-llm-security/SKILL.md): AI/LLM security testing, prompt injection resistance, OWASP LLM Top 10 (2025), RAG/agent security, and model supply chain.
- [**`17-mobile-security`**](./17-mobile-security/SKILL.md): Android & iOS security testing, OWASP MASVS/MASTG, APK/IPA static analysis, and secure storage review.
- [**`18-ot-ics-security`**](./18-ot-ics-security/SKILL.md): OT / ICS / SCADA security, Purdue model segmentation, Modbus/DNP3/S7 analysis, and IEC 62443 compliance.
- [**`19-grc-compliance`**](./19-grc-compliance/SKILL.md): Governance, risk & compliance, NIST CSF 2.0 / ISO 27001:2022 / SOC 2 / CIS Controls v8 mapping, and risk registers.
- [**`20-supply-chain-security`**](./20-supply-chain-security/SKILL.md): Software supply chain security, SBOM analysis, dependency confusion/typosquatting detection, and SLSA/Sigstore provenance.
- [**`21-threat-intelligence`**](./21-threat-intelligence/SKILL.md): Cyber threat intelligence (CTI) lifecycle, STIX/TAXII, MISP, Diamond Model, IOC normalization, and actor tracking.
- [**`22-purple-team`**](./22-purple-team/SKILL.md): Purple team operations, adversary emulation (Atomic Red Team, CALDERA), detection coverage validation (DeTT&CT), and MTTD reporting.

---

### 6. 🎯 Bug Hunting, Red Team & Vulnerability Research (Claude-BugHunter — 83 Skills & 15 Commands)
Production-grade external red-team & bug-hunting knowledge base from `elementalsouls/Claude-BugHunter`, curated from 681 disclosed HackerOne reports across 24 vulnerability classes:

- **Framework-Specific Exploitation & Defense**:
  - [`hunt-nextjs`](./hunt-nextjs/SKILL.md): Server Actions auth bypass, `/_next/image` SSRF, middleware static route bypass, ISR cache poisoning, and RSC payload leaks.
  - [`hunt-nodejs`](./hunt-nodejs/SKILL.md), [`hunt-laravel`](./hunt-laravel/SKILL.md), [`hunt-springboot`](./hunt-springboot/SKILL.md), [`hunt-aspnet`](./hunt-aspnet/SKILL.md).
- **Core Web Vulnerabilities (58 `hunt-*` Skills)**:
  - [`hunt-idor`](./hunt-idor/SKILL.md), [`hunt-ssrf`](./hunt-ssrf/SKILL.md), [`hunt-sqli`](./hunt-sqli/SKILL.md), [`hunt-xss`](./hunt-xss/SKILL.md), [`hunt-rce`](./hunt-rce/SKILL.md), [`hunt-cors`](./hunt-cors/SKILL.md), [`hunt-csrf`](./hunt-csrf/SKILL.md), [`hunt-race-condition`](./hunt-race-condition/SKILL.md), [`hunt-file-upload`](./hunt-file-upload/SKILL.md), [`hunt-jwt-crypto`](./hunt-jwt-crypto/SKILL.md), [`hunt-oauth`](./hunt-oauth/SKILL.md), [`hunt-saml`](./hunt-saml/SKILL.md), [`hunt-graphql`](./hunt-graphql/SKILL.md), [`hunt-grpc`](./hunt-grpc/SKILL.md), [`hunt-websocket`](./hunt-websocket/SKILL.md), [`hunt-business-logic`](./hunt-business-logic/SKILL.md), [`hunt-cache-poison`](./hunt-cache-poison/SKILL.md), [`hunt-http-smuggling`](./hunt-http-smuggling/SKILL.md), [`hunt-deserialization`](./hunt-deserialization/SKILL.md), [`hunt-shadow-api`](./hunt-shadow-api/SKILL.md).
- **Perimeter & Enterprise Platform Attacks**:
  - [`m365-entra-attack`](./m365-entra-attack/SKILL.md), [`okta-attack`](./okta-attack/SKILL.md), [`enterprise-vpn-attack`](./enterprise-vpn-attack/SKILL.md), [`vmware-vcenter-attack`](./vmware-vcenter-attack/SKILL.md), [`cloud-iam-deep`](./cloud-iam-deep/SKILL.md), [`hunt-k8s`](./hunt-k8s/SKILL.md), [`hunt-cicd`](./hunt-cicd/SKILL.md), [`hunt-sharepoint`](./hunt-sharepoint/SKILL.md).
- **Mobile & AI Red Teaming**:
  - [`apk-redteam-pipeline`](./apk-redteam-pipeline/SKILL.md): Android APK reversing, dynamic hooking, deep link hijacking, and secret extraction.
  - [`ios-redteam-pipeline`](./ios-redteam-pipeline/SKILL.md): iOS IPA decryption, keychain dump, and binary protections.
  - [`hunt-llm-ai`](./hunt-llm-ai/SKILL.md), [`hunt-rag-vector`](./hunt-rag-vector/SKILL.md), [`web3-audit`](./web3-audit/SKILL.md), [`meme-coin-audit`](./meme-coin-audit/SKILL.md).
- **Methodology, Triage & Hygiene**:
  - [`bb-methodology`](./bb-methodology/SKILL.md), [`redteam-mindset`](./redteam-mindset/SKILL.md), [`triage-validation`](./triage-validation/SKILL.md) (7-Question Gate), [`evidence-hygiene`](./evidence-hygiene/SKILL.md), [`report-writing`](./report-writing/SKILL.md), [`bugcrowd-reporting`](./bugcrowd-reporting/SKILL.md).
- **15 Slash Commands & Workflows** (available in `.agents/workflows/` and `.claude/commands/`):
  - `/autopilot`, `/chain`, `/hunt`, `/intel`, `/memory-gc`, `/pickup`, `/recon`, `/remember`, `/report`, `/scope`, `/surface`, `/token-scan`, `/triage`, `/validate`, `/web3-audit`.

---

### 7. 🚀 Full-Stack Engineering & Specialist Skills (Jeffallan/claude-skills — 67 Skills)
Complete collection of 67 full-stack development, framework, and engineering skills from `Jeffallan/claude-skills` (with deep `references/` guides):

- **Languages & Mobile (Directly Targeting CineCub)**:
  - [`kotlin-specialist`](./kotlin-specialist/SKILL.md): Android Jetpack Compose, Coroutines, Flow, Room, and modern Android architecture for `frontend/android-app/`.
  - [`golang-pro`](./golang-pro/SKILL.md): Go 1.24 concurrency, interfaces, channels, and pprof optimization with deep reference guides (`references/concurrency.md`, `references/interfaces.md`, `references/generics.md`, `references/testing.md`).
  - [`typescript-pro`](./typescript-pro/SKILL.md), [`javascript-pro`](./javascript-pro/SKILL.md), [`python-pro`](./python-pro/SKILL.md), [`rust-engineer`](./rust-engineer/SKILL.md), [`swift-expert`](./swift-expert/SKILL.md), [`csharp-developer`](./csharp-developer/SKILL.md), [`cpp-pro`](./cpp-pro/SKILL.md), [`java-architect`](./java-architect/SKILL.md), [`php-pro`](./php-pro/SKILL.md), [`sql-pro`](./sql-pro/SKILL.md).
- **Frontend & Frameworks**:
  - [`nextjs-developer`](./nextjs-developer/SKILL.md): Next.js App Router, React Server Components, Server Actions, and streaming SSR for `frontend/next-storefront/`.
  - [`react-expert`](./react-expert/SKILL.md), [`react-native-expert`](./react-native-expert/SKILL.md), [`vue-expert`](./vue-expert/SKILL.md), [`vue-expert-js`](./vue-expert-js/SKILL.md), [`angular-architect`](./angular-architect/SKILL.md), [`flutter-expert`](./flutter-expert/SKILL.md).
- **Backend Frameworks**:
  - [`nestjs-expert`](./nestjs-expert/SKILL.md), [`fastapi-expert`](./fastapi-expert/SKILL.md), [`django-expert`](./django-expert/SKILL.md), [`django-storages-s3`](./django-storages-s3/SKILL.md), [`spring-boot-engineer`](./spring-boot-engineer/SKILL.md), [`laravel-specialist`](./laravel-specialist/SKILL.md), [`rails-expert`](./rails-expert/SKILL.md), [`dotnet-core-expert`](./dotnet-core-expert/SKILL.md).
- **APIs, Real-Time & Distributed Architecture**:
  - [`websocket-engineer`](./websocket-engineer/SKILL.md): Real-time communication, WebSockets, Socket.IO, reconnect logic, and scale.
  - [`graphql-architect`](./graphql-architect/SKILL.md), [`api-designer`](./api-designer/SKILL.md), [`microservices-architect`](./microservices-architect/SKILL.md), [`mcp-developer`](./mcp-developer/SKILL.md), [`architecture-designer`](./architecture-designer/SKILL.md), [`feature-forge`](./feature-forge/SKILL.md), [`spec-miner`](./spec-miner/SKILL.md).
- **Databases & Cloud Infrastructure**:
  - [`postgres-pro`](./postgres-pro/SKILL.md), [`database-optimizer`](./database-optimizer/SKILL.md), [`cloud-architect`](./cloud-architect/SKILL.md), [`kubernetes-specialist`](./kubernetes-specialist/SKILL.md), [`terraform-engineer`](./terraform-engineer/SKILL.md).
- **Quality, DevOps & Testing**:
  - [`playwright-expert`](./playwright-expert/SKILL.md): Browser automation, E2E testing, visual diffs, and CI pipelines.
  - [`test-master`](./test-master/SKILL.md), [`devops-engineer`](./devops-engineer/SKILL.md), [`monitoring-expert`](./monitoring-expert/SKILL.md), [`sre-engineer`](./sre-engineer/SKILL.md), [`chaos-engineer`](./chaos-engineer/SKILL.md), [`cli-developer`](./cli-developer/SKILL.md), [`code-reviewer`](./code-reviewer/SKILL.md), [`code-documenter`](./code-documenter/SKILL.md), [`debugging-wizard`](./debugging-wizard/SKILL.md).
- **AI, RAG & Data**:
  - [`rag-architect`](./rag-architect/SKILL.md), [`prompt-engineer`](./prompt-engineer/SKILL.md), [`ml-pipeline`](./ml-pipeline/SKILL.md), [`fine-tuning-expert`](./fine-tuning-expert/SKILL.md), [`pandas-pro`](./pandas-pro/SKILL.md), [`spark-engineer`](./spark-engineer/SKILL.md).
- **Specialized Engineering Roles**:
  - [`fullstack-guardian`](./fullstack-guardian/SKILL.md), [`secure-code-guardian`](./secure-code-guardian/SKILL.md), [`security-reviewer`](./security-reviewer/SKILL.md), [`legacy-modernizer`](./legacy-modernizer/SKILL.md), [`atlassian-mcp`](./atlassian-mcp/SKILL.md), [`the-fool`](./the-fool/SKILL.md), [`embedded-systems`](./embedded-systems/SKILL.md), [`game-developer`](./game-developer/SKILL.md), [`shopify-expert`](./shopify-expert/SKILL.md), [`wordpress-pro`](./wordpress-pro/SKILL.md), [`salesforce-developer`](./salesforce-developer/SKILL.md).

---

### 8. 🔍 Claude SEO Analysis & Optimization Suite (AgriciDaniel/claude-seo — 25 Skills, 18 Agents & 56 Execution Tools)
Enterprise-grade SEO analysis, programmatic generation, and search optimization suite from `AgriciDaniel/claude-seo`:

- **Core Audit, Strategy & Workflow**:
  - [`seo`](./seo/SKILL.md): Master orchestrator for end-to-end SEO audits, scoring, and routing across all SEO specialties.
  - [`seo-audit`](./seo-audit/SKILL.md): Comprehensive site audit across crawlability, indexing, on-page factors, performance, and backlink health.
  - [`seo-technical`](./seo-technical/SKILL.md): Technical SEO architecture, robots.txt, canonicalization, server status codes, redirects, rendering (SSR/CSR), and crawl budget.
  - [`seo-page`](./seo-page/SKILL.md): Single-page on-page SEO optimization, meta tags, heading hierarchies, semantic HTML, and keyword distribution.
  - [`seo-plan`](./seo-plan/SKILL.md): Multi-month strategic SEO roadmap planning, prioritization matrices, and KPI milestones.
  - [`seo-flow`](./seo-flow/SKILL.md): Automated step-by-step SEO workflow execution pipelines connecting audits to fixes.
- **Content, Search Intent & Competitor Strategy**:
  - [`seo-content`](./seo-content/SKILL.md): Content optimization, readability scoring, keyword integration, topic authority, and freshness signals.
  - [`seo-content-brief`](./seo-content-brief/SKILL.md): Data-driven content briefs with search intent, target keywords, entity associations, competitor gaps, and structural blueprints.
  - [`seo-cluster`](./seo-cluster/SKILL.md): Topic cluster modeling, pillar-page architecture, internal link graph design, and semantic authority building.
  - [`seo-sxo`](./seo-sxo/SKILL.md): Search Experience Optimization (SEO + UX), conversion path optimization, scroll engagement, and bounce-rate reduction.
  - [`seo-competitor-pages`](./seo-competitor-pages/SKILL.md): Competitor SERP reverse engineering, content gap analysis, backlink differential, and ranking factor comparison.
- **Technical Architecture, Structured Data & Media**:
  - [`seo-schema`](./seo-schema/SKILL.md): Schema.org JSON-LD generation and validation (Movie, TVSeries, VideoObject, Organization, BreadcrumbList, WebPage).
  - [`seo-sitemap`](./seo-sitemap/SKILL.md): XML sitemap generation, index splitting, video/image sitemaps, and lastmod freshness verification.
  - [`seo-hreflang`](./seo-hreflang/SKILL.md): Internationalization, multi-region targeting, hreflang tag generation, and bidirectional confirmation.
  - [`seo-images`](./seo-images/SKILL.md): Image SEO optimization, responsive srcset generation, WebP/AVIF compression, alt-text generation, and layout-shift prevention.
  - [`seo-image-gen`](./seo-image-gen/SKILL.md): AI-powered contextual image generation for hero sections, OpenGraph social cards, and article visuals.
  - [`seo-programmatic`](./seo-programmatic/SKILL.md): Programmatic SEO architecture, database-driven dynamic landing pages, internal linking templates, and thin-content mitigation.
- **Search Engines, AI Search (GEO) & Platform Integrations**:
  - [`seo-google`](./seo-google/SKILL.md): Google Search Console integration, search performance analysis, Indexing API push, and manual action resolution.
  - [`seo-geo`](./seo-geo/SKILL.md): Generative Engine Optimization (GEO) for AI search engines (Perplexity, ChatGPT Search, Google AI Overviews), entity citation optimization, and prompt-query mapping.
  - [`seo-dataforseo`](./seo-dataforseo/SKILL.md): DataForSEO API integration for live SERP scraping, keyword search volume, CPC, and competitor ranking data.
  - [`seo-drift`](./seo-drift/SKILL.md): Search ranking drift detection, algorithm update tracking, SERP volatility alerts, and root-cause diagnostic drills.
  - [`seo-backlinks`](./seo-backlinks/SKILL.md): Link building prospecting, backlink profile analysis, toxic link disavow preparation, and anchor text distribution.
  - [`seo-local`](./seo-local/SKILL.md): Local SEO, Google Business Profile optimization, NAP consistency, and local citation building.
  - [`seo-maps`](./seo-maps/SKILL.md): Google Maps pack ranking strategies, local geo-grid tracking, and local review optimization.
  - [`seo-ecommerce`](./seo-ecommerce/SKILL.md): E-commerce & catalog SEO, product structured data, faceted navigation canonicalization, and category hierarchy optimization.
- **18 Specialized SEO Sub-Agents** (located in `.agents/agents/`):
  - `seo-orchestrator`, `seo-auditor`, `seo-technical-specialist`, `seo-onpage-specialist`, `seo-content-strategist`, `seo-content-writer`, `seo-schema-specialist`, `seo-image-specialist`, `seo-sitemap-specialist`, `seo-geo-specialist`, `seo-gsc-specialist`, `seo-drift-specialist`, `seo-backlink-specialist`, `seo-competitor-analyst`, `seo-programmatic-specialist`, `seo-local-specialist`, `seo-maps-specialist`, `seo-ecommerce-specialist`.
- **Layer 3 Deterministic Python Execution Tools** (located in `execution/seo/`):
  - 56 production Python scripts providing instant execution for Google Search Console (`gsc_query.py`), Core Web Vitals profiling (`lcp_subparts.py`, `crux_history.py`, `pagespeed_check.py`), IndexNow submission (`indexnow_submit.py`), Indexing API notifications (`indexing_notify.py`), Schema validation (`schema_validate.py`), XML sitemap audits (`sitemap_audit.py`), and SERP tracking.

---

### 9. 🧲 Torrent & Media Distribution Management (TorrentClaw — `torrentclaw`)
Specialized torrent search, TMDB metadata enrichment, and client automation skill from `torrentclaw/torrentclaw-skill`:

- **Skill**:
  - [`torrentclaw`](./torrentclaw/SKILL.md): Search movies and TV shows across multiple torrent sources with TMDB metadata, filter by quality (480p–2160p), audio, HDR, and season/episode, detect local clients (qBittorrent, Transmission, Aria2), and dispatch magnets.
- **Layer 3 Deterministic Python Tool** (located in [`execution/torrent/`](../../execution/torrent/)):
  - [`torrentclaw_cli.py`](../../execution/torrent/torrentclaw_cli.py): Cross-platform CLI for searching, downloading `.torrent` files by infoHash, inspecting `.torrent` Bencode structures (file trees, piece sizes, trackers), detecting local clients, and dispatching magnets without shell dependencies.
- **CineCub Monorepo Integration**:
  - Direct synergy with CineCub's [`/api/torrents/[...path]`](../../frontend/next-storefront/src/app/api/torrents/[...path]/route.ts) multi-indexer scraper and [`PlayerModal.tsx`](../../frontend/next-storefront/src/components/PlayerModal.tsx) Webtor P2P client-side player.
