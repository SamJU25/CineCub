# Design Philosophy & The 5 Core Design Skills

Whenever designing, modifying UI, refining styling, or improving the frontend visual aesthetic of CineCub, ALWAYS consult and apply the principles from these 5 core skills (located at `.tmp/skills_research/`):

1. **`taste-skill` (Anti-Slop, Hierarchy & Restraint)**
   - Reject generic AI defaults (no repetitive purple mesh slop, no identical 3-card kits, no unmotivated uppercase eyebrows).
   - Establish intentional typographic scales and strict line-length limits (<80ch for reading).
   - "Spend your boldness in one place" — let one centerpiece shine while keeping surrounding chrome quiet and disciplined.

2. **`impeccable` (Craftsmanship, Contrast & Physics)**
   - Neo-lacquer dark foundations (`#08080f` base, `#0e0c16` panels, `#161424` elevated).
   - High-contrast typography: WCAG AA+ compliant body text (>7:1 ratio) and warm champagne headlines.
   - Tactile spring curves: `cubic-bezier(0.16, 1, 0.3, 1)` for snappy, physical interactions.
   - Mobile touch ergonomics: Minimum 44px tap targets, haptic feedback triggers, and safe-area insets.

3. **`awesome-design-md` (Prestige Streaming UX: Apple TV+, Spotify, Linear)**
   - Media-first visual surfaces: Floating glass island headers, frosted ambient pills, and media specs capsule bars (`4K UHD`, `Dolby Atmos`, `HDR10+`, `IMDb`).
   - Interactive TV series navigation: Horizontal season pill selector and visual episode cards with stills, runtimes, and instant play overlays.
   - Shimmering skeleton loaders during data transitions for continuous perceived fluidity.

4. **`img2threejs` (Atmospheric Procedural Canvas & Particle Physics)**
   - Zero-dependency, ultra-lightweight HTML5 2D canvas engines (<2KB bundle impact).
   - Subtle interactive physics: Cursor-reactive drift and scroll-velocity impulses.
   - GPU-accelerated 60/120fps rendering with automatic battery-saving sleep on idle or background tabs (`visibilitychange`).

5. **`playwright-cli` (Verification Loop & Zero Regressions)**
   - Rigorous visual layout validation across Desktop (1440px), Tablet (768px), and Mobile (375px).
   - Defend the custom dropdown contract: `.select-hide { display: none !important; }`, absolute positioning, and desktop `.browse-filters-wrap { flex-wrap: nowrap; flex-shrink: 0; }`.
