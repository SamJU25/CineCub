/**
 * Reliable email client launcher for both Desktop and Mobile devices.
 * - On Mobile: triggers mailto: which directly opens the native mail app (Gmail, Apple Mail, etc.).
 * - On Desktop:
 *   1. Copies email address to clipboard as a guaranteed safeguard.
 *   2. Opens Gmail web composer in a new tab (guaranteed to work for webmail users
 *      without requiring a native Windows/macOS desktop mail client).
 *   3. Also triggers mailto: as fallback via hidden anchor click if Gmail tab was blocked.
 */
export function openEmailComposer(
  email = "support@cinecub.stream",
  subject = "CineCub Support Inquiry"
) {
  const encSubject = encodeURIComponent(subject);
  const mailtoUrl = `mailto:${email}?subject=${encSubject}`;
  const isMobile =
    typeof navigator !== "undefined" &&
    /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent || "");

  // Always copy email to clipboard so the user has it ready
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(email);
    }
  } catch {}

  if (isMobile) {
    window.location.href = mailtoUrl;
    return;
  }

  // Desktop: Open Gmail web composer
  const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
    email
  )}&su=${encSubject}`;

  try {
    const win = window.open(gmailUrl, "_blank", "noopener,noreferrer");
    if (!win || win.closed || typeof win.closed === "undefined") {
      // Fallback if popup blocked
      const a = document.createElement("a");
      a.href = mailtoUrl;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        if (a.parentNode) {
          a.parentNode.removeChild(a);
        }
      }, 1000);
    }
  } catch {
    window.location.href = mailtoUrl;
  }
}
