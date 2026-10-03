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
  mascotSize,
  title = "CineCub Home",
}: BrandLogoProps) {
  const isAuth = className.includes("auth-brand-lockup");
  const resolvedSize = mascotSize ?? (isAuth ? 64 : 36);

  return (
    <div
      className={`header-brand-logo ${className}`.trim()}
      onClick={onClick}
      title={title}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && onClick) {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <span className="header-mascot-wrap">
        <Mascot
          directions="/mascots/cinecub-directions.webp"
          reactions="/mascots/cinecub-reactions.webp"
          size={resolvedSize}
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
