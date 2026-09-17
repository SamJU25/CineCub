import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Baloo_2 } from "next/font/google";
import Script from "next/script";
import "./style.css";
import "./profile.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-jakarta",
});

// Chunky rounded display font matching the CineCub logo lettering
const baloo = Baloo_2({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  display: "swap",
  variable: "--font-brand",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://cinecub.stream"),
  title: "CineCub - Watch Free Movies, Series & Anime Online",
  description: "Watch free movie online, free series online, and free anime online in HD on CineCub. Stream unlimited movies and TV shows with zero buffering and no signup.",
  keywords: "free movie online, free series online, free anime online, watch free movies online, watch series online free, watch anime online free, free streaming site, stream hd movies, free tv shows online, CineCub",
  authors: [{ name: "CineCub", url: "https://cinecub.stream" }],
  creator: "CineCub",
  publisher: "CineCub",
  category: "entertainment",
  classification: "Streaming, Movies, Television, Anime",
  formatDetection: { telephone: false },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon.ico", type: "image/x-icon", sizes: "any" },
      { url: "/assets/images/favicon-48x48.png", type: "image/png", sizes: "48x48" },
      { url: "/assets/images/favicon-96x96.png", type: "image/png", sizes: "96x96" },
      { url: "/assets/images/favicon-192x192.png", type: "image/png", sizes: "192x192" },
      { url: "/assets/images/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { url: "/assets/images/favicon-16x16.png", type: "image/png", sizes: "16x16" },
    ],
    shortcut: "/favicon.ico",
    apple: [
      { url: "/assets/images/app-logo.png", sizes: "180x180", type: "image/png" },
    ],
  },
  openGraph: {
    title: "CineCub - Watch Free Movies, Series & Anime Online",
    description: "Watch free movie online, free series online, and free anime online in HD on CineCub. Stream unlimited movies and TV shows with zero buffering and no signup.",
    url: "https://cinecub.stream/",
    siteName: "CineCub",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "https://cinecub.stream/assets/images/web-logo.png",
        width: 1200,
        height: 630,
        alt: "CineCub - Free HD Movies, Series & Anime",
        type: "image/png",
      },
      {
        url: "https://cinecub.stream/assets/images/logo-icon.png",
        width: 512,
        height: 512,
        alt: "CineCub Logo",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@CineCub",
    creator: "@CineCub",
    title: "CineCub - Watch Free Movies, Series & Anime Online",
    description: "Watch free movie online, free series online, and free anime online in HD on CineCub. Stream unlimited movies and TV shows with zero buffering.",
    images: ["https://cinecub.stream/assets/images/web-logo.png"],
  },
  alternates: {
    canonical: "https://cinecub.stream/",
  },
};

const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": "https://cinecub.stream/#website",
      url: "https://cinecub.stream/",
      name: "CineCub",
      alternateName: ["CineCub Stream", "CineCub Movies & Series", "cinecub.stream"],
      description: "Watch free movie online, free series online, and free anime online in HD quality with no registration required.",
      publisher: { "@id": "https://cinecub.stream/#organization" },
      image: "https://cinecub.stream/assets/images/logo-icon.png",
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: "https://cinecub.stream/?q={search_term_string}" },
        "query-input": "required name=search_term_string",
      },
      inLanguage: "en-US",
    },
    {
      "@type": "Organization",
      "@id": "https://cinecub.stream/#organization",
      name: "CineCub",
      url: "https://cinecub.stream/",
      logo: {
        "@type": "ImageObject",
        "@id": "https://cinecub.stream/#logo",
        inLanguage: "en-US",
        url: "https://cinecub.stream/assets/images/logo-icon.png",
        contentUrl: "https://cinecub.stream/assets/images/logo-icon.png",
        width: 512,
        height: 512,
        caption: "CineCub",
      },
      image: "https://cinecub.stream/assets/images/logo-icon.png",
      sameAs: [
        "https://t.me/CineCub",
        "https://www.facebook.com/share/1DM4u8dtSo/",
        "https://x.com/CineCub26",
        "https://www.instagram.com/cinecub.stream?stkn=NmRmd2N3NWJxMHRo",
      ],
      contactPoint: { "@type": "ContactPoint", email: "support@cinecub.stream", contactType: "customer support" },
    },
    {
      "@type": "WebApplication",
      "@id": "https://cinecub.stream/#webapp",
      name: "CineCub",
      url: "https://cinecub.stream/",
      applicationCategory: "EntertainmentApplication",
      operatingSystem: "All (Web, Android, iOS, Windows, macOS, Linux)",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
    {
      "@type": "ItemList",
      "@id": "https://cinecub.stream/#navigation",
      name: "CineCub Navigation",
      itemListElement: [
        {
          "@type": "SiteNavigationElement",
          position: 1,
          name: "Free Movies",
          description: "Watch free movies online in Full HD & 4K",
          url: "https://cinecub.stream/?page=browse&cat=movie",
        },
        {
          "@type": "SiteNavigationElement",
          position: 2,
          name: "TV Series",
          description: "Stream full TV series and episodes online free",
          url: "https://cinecub.stream/?page=browse&cat=tv",
        },
        {
          "@type": "SiteNavigationElement",
          position: 3,
          name: "Anime",
          description: "Watch Japanese anime online free with English sub and dub",
          url: "https://cinecub.stream/?page=browse&cat=anime",
        },
        {
          "@type": "SiteNavigationElement",
          position: 4,
          name: "Trending Now",
          description: "Discover the hottest trending movies and series",
          url: "https://cinecub.stream/?page=browse&cat=trending",
        },
        {
          "@type": "SiteNavigationElement",
          position: 5,
          name: "Top Rated",
          description: "Highest rated movies and TV series of all time",
          url: "https://cinecub.stream/?page=browse&cat=toprated",
        },
        {
          "@type": "SiteNavigationElement",
          position: 6,
          name: "Upcoming Releases",
          description: "Anticipated movie and television releases and previews",
          url: "https://cinecub.stream/?page=browse&cat=upcoming",
        },
      ],
    },
    {
      "@type": "FAQPage",
      "@id": "https://cinecub.stream/#faq",
      mainEntity: [
        { "@type": "Question", name: "Is CineCub completely free to watch movies and series online?", acceptedAnswer: { "@type": "Answer", text: "Yes! CineCub allows you to watch free movies online, free TV series online, and free anime online with zero subscription fees, no credit cards, and no hidden costs." } },
        { "@type": "Question", name: "Do I need an account or sign up to stream movies and TV shows?", acceptedAnswer: { "@type": "Answer", text: "No registration is required to stream. You can instantly watch all movies, full series episodes, and anime titles in guest mode right away. If you wish to sync your watchlist and playback history across devices, you can optionally create a free account in seconds." } },
        { "@type": "Question", name: "What streaming quality and servers are available on CineCub?", acceptedAnswer: { "@type": "Answer", text: "CineCub provides High Definition (720p, 1080p, and 4K Ultra HD) video playback across multiple reliable streaming servers, with an optional ad-free native video player for fast, uninterrupted entertainment." } },
        { "@type": "Question", name: "Can I watch English subbed and dubbed anime series for free?", acceptedAnswer: { "@type": "Answer", text: "Yes! CineCub features an extensive collection of popular and classic anime with both English subtitles and English dubbed audio tracks, updated with the latest episodes." } },
        { "@type": "Question", name: "Can I install CineCub as an app on Android and iOS devices?", acceptedAnswer: { "@type": "Answer", text: "Yes, you can download the native CineCub APK directly for Android phones and tablets, or install the Progressive Web App (PWA) via Safari on Apple iOS." } },
      ],
    },
  ],
};

const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://static.cloudflareinsights.com https://www.googletagmanager.com https://accounts.google.com; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://accounts.google.com; font-src 'self' https://cdnjs.cloudflare.com; img-src 'self' data: blob: https://image.tmdb.org https://upload.wikimedia.org https://*.googleusercontent.com https://i.ytimg.com https://*.ytimg.com https://img.youtube.com; media-src 'self' https: blob:; object-src 'none'; frame-src 'self' https: https://www.youtube.com https://www.youtube-nocookie.com https://accounts.google.com; connect-src 'self' https: https://accounts.google.com https://oauth2.googleapis.com; base-uri 'self'; form-action 'self'; frame-ancestors 'none';";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${jakarta.variable} ${baloo.variable}`}>
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="theme-color" content="#0a0a0f" />
        <meta httpEquiv="Content-Security-Policy" content={CSP} />
        <link rel="preconnect" href="https://accounts.google.com" />
        <script src="https://accounts.google.com/gsi/client" async defer></script>
        <link rel="preconnect" href="https://image.tmdb.org" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://vidlink.pro" />
        <link rel="dns-prefetch" href="https://vidlink.pro" />
        <link rel="preconnect" href="https://player.autoembed.co" />
        <link rel="dns-prefetch" href="https://player.autoembed.co" />
        <link rel="preconnect" href="https://vidsrc.sbs" />
        <link rel="dns-prefetch" href="https://vidsrc.sbs" />
        <link rel="preconnect" href="https://multiembed.mov" />
        <link rel="dns-prefetch" href="https://multiembed.mov" />
        <link rel="preconnect" href="https://player.smashystream.com" />
        <link rel="dns-prefetch" href="https://player.smashystream.com" />
        <link rel="preconnect" href="https://vsembed.ru" />
        <link rel="dns-prefetch" href="https://vsembed.ru" />
        <link rel="preconnect" href="https://player.videasy.net" />
        <link rel="dns-prefetch" href="https://player.videasy.net" />
        {/* FAVICONS & GOOGLE SEARCH ICON */}
        <link rel="icon" type="image/x-icon" href="/favicon.ico" />
        <link rel="icon" type="image/png" sizes="48x48" href="/assets/images/favicon-48x48.png" />
        <link rel="icon" type="image/png" sizes="96x96" href="/assets/images/favicon-96x96.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/assets/images/favicon-192x192.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/assets/images/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/assets/images/favicon-16x16.png" />
        <link rel="preconnect" href="https://cdnjs.cloudflare.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://cdnjs.cloudflare.com" />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" precedence="default" crossOrigin="anonymous" referrerPolicy="no-referrer" />
        <link rel="apple-touch-icon" sizes="180x180" href="/assets/images/app-logo.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="CineCub" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="application-name" content="CineCub" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      </head>
      <body id="cv-app" suppressHydrationWarning>
        {children}
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            try {
              var isApp = !!(
                window.AndroidShare ||
                window.CineCubAndroid ||
                window.StreamHeavenAndroid ||
                window.CineCubNativeApp ||
                window.StreamHeavenNativeApp ||
                navigator.userAgent.indexOf('CineCubApp') !== -1 ||
                navigator.userAgent.indexOf('StreamHeavenApp') !== -1 ||
                window.matchMedia('(display-mode: standalone)').matches ||
                (window.navigator && window.navigator.standalone === true)
              );
              if (isApp) {
                document.documentElement.classList.add('is-app-env');
                document.documentElement.classList.remove('is-web-env');
              } else {
                document.documentElement.classList.add('is-web-env');
                document.documentElement.classList.remove('is-app-env');
                try { localStorage.removeItem('is_app_env'); } catch(e){}
              }
            } catch(e){}
              window.addEventListener('beforeinstallprompt', function(e) {
                e.preventDefault();
                return false;
              });

              // Anti-Hijack Guard: Blocks third-party ad popups and beforeunload lockups
              window.addEventListener('beforeunload', function(e) {
                delete e['returnValue'];
              }, true);
              window.onbeforeunload = null;
              Object.defineProperty(window, 'onbeforeunload', {
                get: function() { return null; },
                set: function() { return false; },
                configurable: false
              });

              var originalOpen = window.open;
              window.open = function(url, target, features) {
                if (!url) return null;
                var str = String(url).toLowerCase();
                if (
                  str.indexOf('t.me') !== -1 ||
                  str.indexOf('telegram.me') !== -1 ||
                  str.indexOf('cinecub.stream') !== -1 ||
                  str.indexOf('mail.google.com') !== -1 ||
                  str.indexOf('outlook.live.com') !== -1 ||
                  str.indexOf('outlook.office.com') !== -1 ||
                  str.indexOf('instagram.com') !== -1 ||
                  str.indexOf('facebook.com') !== -1 ||
                  str.indexOf('x.com') !== -1 ||
                  str.indexOf('twitter.com') !== -1 ||
                  str.indexOf('mailto:') === 0 ||
                  str.indexOf('tel:') === 0
                ) {
                  return originalOpen.apply(window, arguments);
                }
                return null;
              };

              // Anti-Downloader: Suppresses right-click menu on videos
              document.addEventListener('contextmenu', function(e) {
                if (e.target && (e.target.nodeName === 'VIDEO' || (e.target.closest && e.target.closest('.player-wrap')))) {
                  e.preventDefault();
                  return false;
                }
              }, true);
            })();
          `}} />
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-BHBJSJW06B"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-BHBJSJW06B');
          `}
        </Script>
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').then(function(registration) {
              console.log('[SW] Registered:', registration.scope);
            }).catch(function(err) {
              console.warn('[SW] Registration failed:', err);
            });
          }
        `}} />
      </body>
    </html>
  );
}
