"use client";

/**
 * BrandLogo — the CineCub wordmark lockup shared by every top navigation.
 *
 * Desktop (fine pointer): bear mascot on top, "CineCub" text tucked beneath it.
 * Mobile / tablets / touch: the original image logo.
 *
 * Used by both Header (home nav) and DetailModal (movie/series detail nav) so the
 * branding can never drift apart between views.
 */

import { Mascot } from "@/components/Mascot";

export interface BrandLogoProps {
  onClick?: () => void;
  /** Extra classes, e.g. `fv-brand-logo` for the detail-view nav. */
  className?: string;
  /** Square mascot size in px. */
  mascotSize?: number;
  title?: string;
}

export function BrandLogo({
  onClick,
  className = "",
  mascotSize = 46,
  title = "CineCub Home",
}: BrandLogoProps) {
  return (
    <div
      className={`header-brand-logo header-brand-stacked ${className}`.trim()}
      onClick={onClick}
      title={title}
    >
      {/* Original image logo — shown on mobile / touch devices */}
      <img
        src="/assets/images/web-logo.png"
        alt="CineCub"
        className="header-web-logo mobile-brand-logo"
      />

      {/* Desktop lockup: mascot above the text wordmark */}
      <span className="header-mascot-top">
        <Mascot
          directions="/mascots/cinecub-directions.webp"
          reactions="/mascots/cinecub-reactions.webp"
          size={mascotSize}
          label="CineCub bear mascot"
        />
      </span>
      <span className="header-brand-text">
        <span className="brand-cine">Cine</span>
        <span className="brand-cub">Cub</span>
      </span>
    </div>
  );
}

export default BrandLogo;
