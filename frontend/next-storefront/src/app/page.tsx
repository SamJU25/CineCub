import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import { getMovie, getSeries } from "@/lib/tmdb";
import { CFG } from "@/lib/config";

interface PageProps {
  searchParams: Promise<{
    id?: string;
    type?: string;
    page?: string;
    cat?: string;
    genre?: string;
    q?: string;
    s?: string;
    e?: string;
  }>;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const baseUrl = "https://cinecub.stream";

  // 1. Dynamic Movie / TV Series Detail Page Metadata
  if (params.id) {
    const rawType = (params.type || "movie").toLowerCase();
    const isTv = rawType === "tv" || rawType === "series" || rawType === "anime";
    const mediaType = isTv ? "tv" : "movie";

    try {
      const data = isTv
        ? ((await getSeries(params.id)) as Record<string, unknown> | null)
        : ((await getMovie(params.id)) as Record<string, unknown> | null);

      if (data) {
        const title = (data.title || data.name || "Watch Title") as string;
        const releaseDate = (data.release_date || data.first_air_date || "") as string;
        const year = releaseDate ? ` (${releaseDate.slice(0, 4)})` : "";
        const overview = (data.overview as string) || "";
        const backdropPath = data.backdrop_path as string | null;
        const posterPath = data.poster_path as string | null;

        const ogImageUrl = backdropPath
          ? `https://image.tmdb.org/t/p/w1280${backdropPath}`
          : posterPath
          ? `https://image.tmdb.org/t/p/w780${posterPath}`
          : `${baseUrl}/assets/images/logo-icon.png`;

        const isEpisode = isTv && Boolean(params.s && params.e);
        const epSuffix = isEpisode ? ` S${params.s}:E${params.e}` : "";
        const pageTitle = isEpisode
          ? `${title}${epSuffix} - Watch Free in HD | CineCub`
          : `${title}${year} - Watch Free in HD | CineCub`;
        const pageDesc = isEpisode
          ? `Watch ${title} Season ${params.s} Episode ${params.e} online free in Full HD/4K on CineCub. ${overview ? overview.slice(0, 130) + "..." : ""} Stream ad-free with English subtitles.`
          : overview
          ? `Watch ${title}${year} online free in Full HD/4K on CineCub. ${overview.slice(0, 140)}... Stream ad-free with English subtitles.`
          : `Watch ${title}${year} online free in Full HD/4K on CineCub with multiple streaming servers, fast buffering, and English subtitles.`;

        const canonicalUrl = isEpisode
          ? `${baseUrl}/?id=${params.id}&type=${mediaType}&s=${params.s}&e=${params.e}`
          : `${baseUrl}/?id=${params.id}&type=${mediaType}`;

        return {
          title: pageTitle,
          description: pageDesc,
          alternates: { canonical: canonicalUrl },
          openGraph: {
            title: pageTitle,
            description: pageDesc,
            url: canonicalUrl,
            siteName: "CineCub",
            type: isTv ? "video.tv_show" : "video.movie",
            images: [
              {
                url: ogImageUrl,
                width: 1280,
                height: 720,
                alt: `${title}${year} Backdrop`,
              },
            ],
          },
          twitter: {
            card: "summary_large_image",
            site: "@CineCub",
            creator: "@CineCub",
            title: pageTitle,
            description: pageDesc,
            images: [ogImageUrl],
          },
        };
      }
    } catch {
      // Fall through to category / default
    }
  }

  // 2. Genre-Specific Landing Pages
  if (params.genre) {
    const gid = parseInt(params.genre, 10);
    const g = CFG.GENRES.find((x) => x.id === gid);
    const genreName = g ? g.name : "Popular";
    const cat = (params.cat || "movie").toLowerCase();
    const mediaLabel = cat === "tv" ? "TV Series & Shows" : cat === "anime" ? "Anime" : "Movies";
    const genreTitle = `Watch Free ${genreName} ${mediaLabel} Online in HD | CineCub`;
    const genreDesc = `Stream the best ${genreName} ${mediaLabel.toLowerCase()} online free in Full HD/4K on CineCub. No registration, instant streaming, and English subtitles.`;
    const genreUrl = `${baseUrl}/?page=browse&cat=${cat}&genre=${params.genre}`;

    return {
      title: genreTitle,
      description: genreDesc,
      alternates: { canonical: genreUrl },
      openGraph: {
        title: genreTitle,
        description: genreDesc,
        url: genreUrl,
        siteName: "CineCub",
        type: "website",
        images: [
          {
            url: `${baseUrl}/assets/images/web-logo.png`,
            width: 1200,
            height: 630,
            alt: `CineCub - Free ${genreName} ${mediaLabel}`,
          },
        ],
      },
      twitter: {
        card: "summary_large_image",
        site: "@CineCub",
        creator: "@CineCub",
        title: genreTitle,
        description: genreDesc,
        images: [`${baseUrl}/assets/images/web-logo.png`],
      },
    };
  }

  // 3. Category & Browse Landing Pages
  if (params.cat) {
    const cat = params.cat.toLowerCase();
    const categoryConfigs: Record<string, { title: string; desc: string }> = {
      movie: {
        title: "Watch Free Movies Online in Full HD & 4K | CineCub",
        desc: "Explore thousands of popular, trending, and blockbuster movies online free. Stream in 1080p and 4K with multiple sources and English subtitles on CineCub.",
      },
      tv: {
        title: "Watch TV Shows & Full Series Online Free | CineCub",
        desc: "Binge watch full seasons of top-rated TV shows and series online free on CineCub. Daily episode updates, no ads, and multi-device support.",
      },
      anime: {
        title: "Watch Free Anime Online with English Sub & Dub | CineCub",
        desc: "Stream popular and classic Japanese anime online free with English subtitles and dubbing in high quality on CineCub.",
      },
      trending: {
        title: "Trending Movies & TV Series Today | CineCub",
        desc: "Discover what the world is watching today. Stream the hottest trending movies and series online free on CineCub.",
      },
      popular: {
        title: "Most Popular Movies & TV Series | CineCub",
        desc: "Stream the most popular, crowd-favorite movies and TV series online free in HD on CineCub. Updated daily with zero subscription.",
      },
      toprated: {
        title: "Top Rated Movies & TV Shows of All Time | CineCub",
        desc: "Stream the highest rated, critically acclaimed movies and series of all time online free on CineCub.",
      },
      upcoming: {
        title: "Upcoming Movies & TV Series Releases | CineCub",
        desc: "Stay ahead with trailers, previews, and release dates for the most anticipated upcoming movies and TV shows on CineCub.",
      },
    };

    const config = categoryConfigs[cat] || {
      title: "Browse Movies, TV Shows & Anime Free | CineCub",
      desc: "Watch free movies and TV shows online in Full HD on CineCub. Fast streaming, no signup required.",
    };

    const catUrl = `${baseUrl}/?page=browse&cat=${cat}`;
    return {
      title: config.title,
      description: config.desc,
      alternates: { canonical: catUrl },
      openGraph: {
        title: config.title,
        description: config.desc,
        url: catUrl,
        siteName: "CineCub",
        type: "website",
        images: [
          {
            url: `${baseUrl}/assets/images/web-logo.png`,
            width: 1200,
            height: 630,
            alt: config.title,
          },
        ],
      },
      twitter: {
        card: "summary_large_image",
        site: "@CineCub",
        creator: "@CineCub",
        title: config.title,
        description: config.desc,
        images: [`${baseUrl}/assets/images/web-logo.png`],
      },
    };
  }

  // 4. Search Query Results
  if (params.q) {
    const qTitle = `Search: "${params.q}" - Watch Free Online | CineCub`;
    const qDesc = `Find and stream movies, TV shows, and anime matching "${params.q}" in HD online free on CineCub.`;
    const qUrl = `${baseUrl}/?page=search&q=${encodeURIComponent(params.q)}`;
    return {
      title: qTitle,
      description: qDesc,
      alternates: { canonical: qUrl },
      openGraph: {
        title: qTitle,
        description: qDesc,
        url: qUrl,
        siteName: "CineCub",
        type: "website",
        images: [
          {
            url: `${baseUrl}/assets/images/web-logo.png`,
            width: 1200,
            height: 630,
            alt: qTitle,
          },
        ],
      },
      twitter: {
        card: "summary_large_image",
        site: "@CineCub",
        creator: "@CineCub",
        title: qTitle,
        description: qDesc,
        images: [`${baseUrl}/assets/images/web-logo.png`],
      },
    };
  }

  // 5. Default Homepage
  return {
    title: "CineCub - Watch Free Movies, Series & Anime Online",
    description: "Watch free movie online, free series online, and free anime online in HD on CineCub. Stream unlimited movies and TV shows with zero buffering and no signup.",
    alternates: { canonical: `${baseUrl}/` },
    openGraph: {
      title: "CineCub - Watch Free Movies, Series & Anime Online",
      description: "Watch free movie online, free series online, and free anime online in HD on CineCub. Stream unlimited movies and TV shows with zero buffering and no signup.",
      url: `${baseUrl}/`,
      siteName: "CineCub",
      type: "website",
      images: [
        {
          url: `${baseUrl}/assets/images/web-logo.png`,
          width: 1200,
          height: 630,
          alt: "CineCub - Free Movies, Series & Anime",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      site: "@CineCub",
      creator: "@CineCub",
      title: "CineCub - Watch Free Movies, Series & Anime Online",
      description: "Watch free movie online, free series online, and free anime online in HD on CineCub. Stream unlimited movies and TV shows with zero buffering and no signup.",
      images: [`${baseUrl}/assets/images/web-logo.png`],
    },
  };
}

export default async function HomePage({ searchParams }: PageProps) {
  const params = await searchParams;
  let detailLd: Record<string, unknown> | null = null;

  if (params.id) {
    try {
      const isTv = params.type === "tv" || params.type === "series" || params.type === "anime";
      const mediaType = isTv ? "tv" : "movie";
      const data = isTv
        ? ((await getSeries(params.id)) as Record<string, unknown> | null)
        : ((await getMovie(params.id)) as Record<string, unknown> | null);

      if (data) {
        const title = (data.title || data.name || "") as string;
        const releaseDate = (data.release_date || data.first_air_date || "") as string;
        const overview = (data.overview as string) || "";
        const backdropPath = data.backdrop_path as string | null;
        const posterPath = data.poster_path as string | null;
        const voteAverage = data.vote_average as number | undefined;
        const voteCount = data.vote_count as number | undefined;
        const genres = Array.isArray(data.genres)
          ? data.genres.map((g: { name: string }) => g.name)
          : [];

        const imageUrl = backdropPath
          ? `https://image.tmdb.org/t/p/w1280${backdropPath}`
          : posterPath
          ? `https://image.tmdb.org/t/p/w780${posterPath}`
          : "https://cinecub.stream/assets/images/logo-icon.png";

        const watchAction = {
          "@type": "WatchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: isTv && params.s && params.e
              ? `https://cinecub.stream/?id=${params.id}&type=tv&s=${params.s}&e=${params.e}`
              : `https://cinecub.stream/?id=${params.id}&type=${mediaType}`,
            actionPlatform: [
              "http://schema.org/DesktopWebPlatform",
              "http://schema.org/MobileWebPlatform",
              "http://schema.org/AndroidPlatform",
              "http://schema.org/IOSPlatform",
            ],
          },
          expectsAcceptanceOf: {
            "@type": "Offer",
            category: "free",
            price: "0",
            priceCurrency: "USD",
          },
        };

        const videoObject = {
          "@type": "VideoObject",
          name: isTv && params.s && params.e
            ? `${title} Season ${params.s} Episode ${params.e}`
            : `${title} (${releaseDate ? releaseDate.slice(0, 4) : "HD"})`,
          description: overview || `Watch ${title} online free in Full HD/4K on CineCub.`,
          thumbnailUrl: [imageUrl],
          uploadDate: releaseDate ? `${releaseDate}T00:00:00Z` : "2024-01-01T00:00:00Z",
          contentUrl: isTv && params.s && params.e
            ? `https://cinecub.stream/?id=${params.id}&type=tv&s=${params.s}&e=${params.e}`
            : `https://cinecub.stream/?id=${params.id}&type=${mediaType}`,
          embedUrl: isTv && params.s && params.e
            ? `https://cinecub.stream/?id=${params.id}&type=tv&s=${params.s}&e=${params.e}`
            : `https://cinecub.stream/?id=${params.id}&type=${mediaType}`,
          potentialAction: {
            "@type": "SeekToAction",
            target: isTv && params.s && params.e
              ? `https://cinecub.stream/?id=${params.id}&type=tv&s=${params.s}&e=${params.e}&t={seek_to_second_number}`
              : `https://cinecub.stream/?id=${params.id}&type=${mediaType}&t={seek_to_second_number}`,
            "startOffset-input": "required name=seek_to_second_number",
          },
        };

        if (isTv && params.s && params.e) {
          const episodeCanonical = `https://cinecub.stream/?id=${params.id}&type=tv&s=${params.s}&e=${params.e}`;
          const episodeEntity = {
            "@type": "TVEpisode",
            "@id": `${episodeCanonical}#episode`,
            name: `${title} Season ${params.s} Episode ${params.e}`,
            image: imageUrl,
            partOfSeries: {
              "@type": "TVSeries",
              name: title,
            },
            episodeNumber: parseInt(params.e, 10),
            seasonNumber: parseInt(params.s, 10),
            description: overview || undefined,
            potentialAction: watchAction,
            breadcrumb: {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Home", item: "https://cinecub.stream/" },
                { "@type": "ListItem", position: 2, name: "TV Series", item: "https://cinecub.stream/?page=browse&cat=tv" },
                { "@type": "ListItem", position: 3, name: title, item: `https://cinecub.stream/?id=${params.id}&type=tv` },
                { "@type": "ListItem", position: 4, name: `S${params.s}:E${params.e}`, item: episodeCanonical },
              ],
            },
          };

          detailLd = {
            "@context": "https://schema.org",
            "@graph": [episodeEntity, videoObject],
          };
        } else {
          const seasons = isTv && Array.isArray(data.seasons)
            ? (data.seasons as { season_number: number; episode_count?: number; name?: string }[])
                .filter((s) => s.season_number > 0)
                .map((s) => ({
                  "@type": "TVSeason",
                  seasonNumber: s.season_number,
                  name: s.name || `Season ${s.season_number}`,
                  numberOfEpisodes: s.episode_count || undefined,
                }))
            : undefined;

          const detailCanonical = `https://cinecub.stream/?id=${params.id}&type=${mediaType}`;
          const mediaEntity = {
            "@type": isTv ? "TVSeries" : "Movie",
            "@id": `${detailCanonical}#media`,
            name: title,
            image: imageUrl,
            dateCreated: releaseDate || undefined,
            datePublished: releaseDate || undefined,
            genre: genres.length > 0 ? genres : undefined,
            description: overview || undefined,
            containsSeason: seasons && seasons.length > 0 ? seasons : undefined,
            aggregateRating:
              voteAverage && voteAverage > 0
                ? {
                    "@type": "AggregateRating",
                    ratingValue: voteAverage.toFixed(1),
                    bestRating: "10",
                    ratingCount: voteCount || 100,
                  }
                : undefined,
            potentialAction: watchAction,
            breadcrumb: {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Home", item: "https://cinecub.stream/" },
                { "@type": "ListItem", position: 2, name: isTv ? "TV Series" : "Movies", item: `https://cinecub.stream/?page=browse&cat=${mediaType}` },
                { "@type": "ListItem", position: 3, name: title, item: detailCanonical },
              ],
            },
          };

          detailLd = {
            "@context": "https://schema.org",
            "@graph": [mediaEntity, videoObject],
          };
        }
      }
    } catch {
      // Fallback
    }
  }

  if (!detailLd && params.cat) {
    const cat = params.cat.toLowerCase();
    const catName =
      cat === "movie"
        ? "Free Movies"
        : cat === "tv"
        ? "TV Series"
        : cat === "anime"
        ? "Anime"
        : cat === "trending"
        ? "Trending"
        : cat === "popular"
        ? "Popular"
        : cat === "toprated"
        ? "Top Rated"
        : cat === "upcoming"
        ? "Upcoming"
        : "Browse";

    detailLd = {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `${catName} - CineCub`,
      url: `https://cinecub.stream/?page=browse&cat=${cat}`,
      description: `Watch free ${catName.toLowerCase()} online in HD on CineCub.`,
      breadcrumb: {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: "https://cinecub.stream/",
          },
          {
            "@type": "ListItem",
            position: 2,
            name: catName,
            item: `https://cinecub.stream/?page=browse&cat=${cat}`,
          },
        ],
      },
    };
  }

  return (
    <>
      {detailLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(detailLd) }}
        />
      )}
      <AppShell initialParams={params} />
    </>
  );
}
