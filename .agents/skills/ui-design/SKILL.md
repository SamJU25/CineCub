---
name: ui-design
description: Master guidelines, design systems, visual hierarchy, dark mode, glassmorphism, typography, responsive layouts, micro-interactions, and accessibility standards for StreamHeaven and modern web/mobile apps. Make sure to use this skill whenever designing, styling, or refining UI components, CSS layouts, navigation, modals, video player overlays, color palettes, animations, typography, or responsive touch interfaces.
---

# UI & UX Design System Guidelines

A comprehensive design manual for crafting world-class, visually stunning, highly performant, and accessible interfaces for StreamHeaven and modern web applications.

---

## 1. Design Aesthetics & Core Visual Identity

StreamHeaven's aesthetic is **Dark-mode Cyber-Glassmorphism** — combining ultra-deep obsidian surfaces, luminous neon accents, rich backdrop blurs, and tactile micro-animations. Interfaces must look sleek, cinematic, and premium.

### Primary Color Tokens

```css
:root {
  /* Deep Space Canvas */
  --bg-app: #08080e;             /* Primary app background */
  --bg-surface: #0e0c16;         /* Elevated cards & sidebars */
  --bg-surface-elevated: #161424;/* Modals & floating popovers */
  --bg-glass: rgba(14, 12, 22, 0.85); /* Glassmorphic backdrops */

  /* Neon Brand Accents */
  --cv-purple: #9d4edd;          /* Primary brand glow */
  --cv-purple-dark: #7928ca;     /* Gradient deep end */
  --cv-purple-light: #c77dff;    /* Highlights & badges */
  --cv-purple-glow: rgba(157, 78, 221, 0.45);

  /* Functional Accents */
  --cv-cyan: #00f2fe;            /* Cloud stream & info state */
  --cv-green: #2ed573;           /* Success, verified, cached */
  --cv-red: #ff4757;             /* Danger, mute, live badge */
  --cv-amber: #ffa502;           /* Warnings, ratings */

  /* Text & Contrast */
  --text-primary: #ffffff;
  --text-secondary: #a2a2b8;
  --text-muted: rgba(255, 255, 255, 0.45);
  --border-subtle: rgba(255, 255, 255, 0.08);
  --border-active: rgba(157, 78, 221, 0.4);
}
```

### Glassmorphism Recipe

Never use plain solid panels where frosted glass creates depth:

```css
.glass-panel {
  background: rgba(14, 12, 22, 0.82);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6), 
              0 0 0 1px rgba(255, 255, 255, 0.04),
              0 4px 20px rgba(157, 78, 221, 0.12);
}
```

---

## 2. Spatial Scale & Layout Rhythm

All spacing must adhere to an **8px base grid** (with 4px for fine alignments):

| Token | Size | Typical Usage |
|---|---|---|
| `space-1` | `4px` | Fine icon gaps, badge padding, timeline heights |
| `space-2` | `8px` | Button gaps, compact list item padding |
| `space-3` | `12px` | Card internal padding, tag gaps, popover padding |
| `space-4` | `16px` | Standard container padding, form field gaps |
| `space-6` | `24px` | Section margins, grid gutters |
| `space-8` | `32px` | Major section headers, modal margins |
| `space-12`| `48px` | Page breaks, hero banners |

---

## 3. Responsive Breakpoints & Mobile Touch Ergonomics

Interfaces must adapt seamlessly without horizontal scroll or control overlap.

```css
/* Standard Breakpoint Ladder */
/* Mobile Portrait */       @media (max-width: 480px) { ... }
/* Mobile Landscape/Phablet*/@media (max-width: 650px) { ... }
/* Tablet */                @media (max-width: 768px) { ... }
/* Small Laptop */          @media (max-width: 1024px) { ... }
/* Desktop High-Res */      @media (min-width: 1440px) { ... }
```

### Mobile Video Controls Rules
1. **Never let time text collide with controls**:
   - On screens $\le$ 650px, hide non-essential buttons (e.g. PiP) to guarantee breathing room.
   - Use `tabular-nums`, `font-size: 11.5px`, and `flex-shrink: 0;` on timestamps.
   - Use `justify-content: space-between;` with `flex: 0 1 auto;` on left controls so extra space stays in the center.
2. **Touch Targets**:
   - Minimum tap target: **40px × 40px** for touch targets, or minimum 32px with generous padding/margin.
   - Add `-webkit-tap-highlight-color: transparent;` and `touch-action: manipulation;` on interactive controls.
3. **Modal & Popover Viewport Clamping**:
   - Popovers inside video players must use `max-height: calc(100% - 60px); overflow-y: auto;` so back buttons and headers are never clipped by video boundaries.
   - Headers/back buttons inside scrolling popovers must be `position: sticky; top: 0; z-index: 10;`.

---

## 4. Typography System

Use clean, geometric sans-serif fonts with modern tabular numerals for media timestamps:

```css
body {
  font-family: 'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Tabular numbers for counters, timers, bitrates */
.tabular-data,
.player-time-display {
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.1px;
}
```

### Typographic Scale
- **Display 1 (Hero Title)**: `clamp(2rem, 5vw, 3.5rem)`, weight `800`, letter-spacing `-0.8px`
- **Heading 1 (Page Title)**: `clamp(1.5rem, 3.5vw, 2.25rem)`, weight `700`, letter-spacing `-0.5px`
- **Heading 2 (Section Title)**: `1.25rem` (`20px`), weight `700`
- **Heading 3 (Card Title)**: `1.05rem` (`17px`), weight `600`
- **Body Regular**: `0.9375rem` (`15px`), weight `400`, line-height `1.55`
- **Body Small / Captions**: `0.8125rem` (`13px`), weight `500`
- **Micro / Badges**: `0.6875rem` (`11px`), weight `700`, text-transform `uppercase`

---

## 5. Micro-Interactions & Spring Animations

Static UIs feel cheap; dynamic, physics-based micro-interactions feel state-of-the-art.

### Physics Easing Curve
Always use the spring cubic-bezier for snappy, premium movement:
```css
--ease-spring: cubic-bezier(0.16, 1, 0.3, 1);
```

### Interactive Card Hover
```css
.media-card {
  transition: transform 0.25s var(--ease-spring), 
              box-shadow 0.25s var(--ease-spring),
              border-color 0.25s ease;
  border: 1px solid var(--border-subtle);
}

.media-card:hover {
  transform: translateY(-5px) scale(1.02);
  border-color: rgba(157, 78, 221, 0.5);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.6), 
              0 0 20px rgba(157, 78, 221, 0.25);
}
```

### Subtle Button Press
```css
.btn-interactive:active {
  transform: scale(0.95);
  transition: transform 0.08s ease;
}
```

---

## 6. Accessibility (a11y) Best Practices

1. **Focus Rings**:
   - Never suppress outline without providing `:focus-visible`:
   ```css
   :focus-visible {
     outline: 2px solid var(--cv-purple);
     outline-offset: 2px;
   }
   ```
2. **Color Contrast**:
   - Ensure text contrast $\ge$ 4.5:1 against dark backgrounds for body text.
   - Use `#ffffff` or `rgba(255, 255, 255, 0.92)` for high-importance text, `#a2a2b8` for secondary text. Avoid anything below `rgba(255, 255, 255, 0.4)`.
3. **ARIA & Semantic HTML**:
   - Every icon button MUST include `aria-label` or `title` (e.g. `aria-label="Play video"`).
   - Use `<button type="button">` instead of clickable `<div>`s.
   - Use `aria-expanded` on dropdowns and menus (`#player-btn-settings`).
4. **Reduced Motion**:
   ```css
   @media (prefers-reduced-motion: reduce) {
     *, *::before, *::after {
       animation-duration: 0.01ms !important;
       animation-iteration-count: 1 !important;
       transition-duration: 0.01ms !important;
       scroll-behavior: auto !important;
     }
   }
   ```

---

## 7. UI Review Checklist (Before Committing Changes)

- [ ] **Contrast**: Are all labels readable against dark background and gradients?
- [ ] **Mobile Touch Test**: Can buttons be tapped easily without misclicks on a 360px screen?
- [ ] **No Overlap**: Does the bottom bar guarantee at least 40px clearance between left and right controls?
- [ ] **Overflow Test**: Do popups and modals fit within the viewport when opened on small devices?
- [ ] **Transitions**: Are interactive elements using smooth spring transitions?
- [ ] **Active States**: Does the selected item have a distinct, glowing visual indicator?

---

## 8. Custom Comboboxes & Dropdowns Architecture

StreamHeaven replaces native `<select>` elements with a custom dropdown mechanism (`CustomSelect` in `public/script.js`). This component powers server selection, season/episode pickers, and catalog browse filters.

### The Invariable Dropdown CSS Contract

Whenever modifying or extending custom selects:
1. **`.select-hide` must ALWAYS have `display: none !important;`**:
   - `CustomSelect.init()` and `CustomSelect.closeAll()` manage visibility via `.select-hide`.
   - If `.select-hide` is omitted or overridden, all dropdown options on the page render permanently visible on page load.
2. **`.select-items` must ALWAYS be `position: absolute;`**:
   - Must specify `position: absolute; top: calc(100% + 6px); left: 0; right: 0; z-index: 6000;`.
   - Must clamp height with `max-height: 260px` to `280px` and `overflow-y: auto; -webkit-overflow-scrolling: touch;`.
   - **Critical Hazard**: If `.select-items` is rendered in static/relative flow, it will physically occupy document space, blowing up parent toolbar heights (from 40px to 500px+) and throwing flexbox layouts into stair-stepped chaos.
3. **Z-Index Layering on Open**:
   - When a combobox is open, elevate its containing wrapper so it stacks above siblings:
     ```css
     .custom-select:has(.select-arrow-active),
     .custom-select.select-open {
       z-index: 6005;
     }
     ```
   - Parent toolbars (such as `.ep-nav`) must have `position: relative; z-index: 100;` and NEVER have `overflow: hidden;` so the dropdown menu can float freely above the video player below it.
4. **Preserve Global Rules When Scoping**:
   - Never replace global base rules (`.custom-select`, `.select-selected`, `.select-items`, `.select-hide`) when adding scoped component styles (like `.ep-nav .select-items`). Scoped rules must inherit from or augment the base system.
5. **Desktop Toolbars MUST Enforce `flex-direction: row; flex-wrap: nowrap;`**:
   - In flex headers with breadcrumbs and titles (e.g. `.browse-header` with `justify-content: space-between;`), nested filter toolbars (`.browse-filters-wrap`) must have:
     ```css
     .browse-filters-wrap {
       display: flex;
       flex-direction: row;
       flex-wrap: nowrap;
       align-items: center;
       justify-content: flex-end;
       gap: 10px;
       flex-shrink: 0;
     }
     ```
   - Each combobox wrapper must define a rigid/safe desktop width (e.g., `width: 175px; flex: 0 0 auto;`).
   - If `flex-wrap: wrap;` is applied without an explicit container width, Chromium's min-content sizing will wrap adjacent comboboxes into a vertical column on PC desktop.
   - For vertical baseline harmony, use `align-items: flex-end;` on the parent `.browse-header` so the 38px comboboxes rest on the section title's baseline.
   - **Confine wrapping to mobile**: Responsive multi-line wrapping (`flex: 1 1 calc(50% - 4px)`) must live strictly inside `@media (max-width: 680px)`.
