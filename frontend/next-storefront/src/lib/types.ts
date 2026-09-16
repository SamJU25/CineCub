export interface MediaItem {
  id: number;
  title?: string;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  vote_count?: number;
  genre_ids?: number[];
  genres?: { id: number; name: string }[];
  media_type?: string;
  popularity?: number;
  original_language?: string;
  origin_country?: string[];
  adult?: boolean;
  video?: boolean;
  profile_path?: string;
  known_for?: MediaItem[];
  known_for_department?: string;
}

export interface MediaDetail extends MediaItem {
  genres?: { id: number; name: string }[];
  runtime?: number;
  number_of_seasons?: number;
  number_of_episodes?: number;
  seasons?: Season[];
  credits?: {
    cast: CastMember[];
    crew: CrewMember[];
  };
  videos?: {
    results: Video[];
  };
  similar?: { results: MediaItem[] };
  recommendations?: { results: MediaItem[] };
  keywords?: { keywords: Keyword[] } | { results: Keyword[] };
  external_ids?: ExternalIds;
  belongs_to_collection?: { id: number; name: string; poster_path: string | null; backdrop_path: string | null };
  budget?: number;
  revenue?: number;
  status?: string;
  tagline?: string;
  episode_run_time?: number[];
  production_companies?: { id: number; name: string; logo_path: string | null }[];
  spoken_languages?: { english_name: string; iso_639_1: string }[];
  content_ratings?: { results: { iso_3166_1: string; rating: string }[] };
  release_dates?: { results: { iso_3166_1: string; release_dates: { certification: string; release_date: string }[] }[] };
  translations?: { translations: { iso_639_1: string; english_name: string }[] };
}

export interface CastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
  known_for_department?: string;
  order?: number;
}

export interface CrewMember {
  id: number;
  name: string;
  job: string;
  department: string;
  profile_path: string | null;
}

export interface Video {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
  official?: boolean;
  published_at?: string;
}

export interface Season {
  id: number;
  name: string;
  overview?: string;
  season_number: number;
  episode_count: number;
  air_date?: string;
  poster_path: string | null;
}

export interface Episode {
  id: number;
  name: string;
  overview: string;
  episode_number: number;
  season_number: number;
  air_date?: string;
  still_path: string | null;
  vote_average?: number;
  runtime?: number;
}

export interface Keyword {
  id: number;
  name: string;
}

export interface ExternalIds {
  imdb_id?: string;
  tvdb_id?: number;
  facebook_id?: string;
  instagram_id?: string;
  twitter_id?: string;
}

export interface PersonDetail {
  id: number;
  name: string;
  biography: string;
  birthday: string | null;
  deathday: string | null;
  gender: number;
  place_of_birth: string | null;
  profile_path: string | null;
  known_for_department: string;
  also_known_as: string[];
  external_ids: ExternalIds;
  combined_credits?: { cast: MediaItem[]; crew: MediaItem[] };
  movie_credits?: { cast: MediaItem[]; crew: MediaItem[] };
  tv_credits?: { cast: MediaItem[]; crew: MediaItem[] };
}

export type StreamMode = "direct" | "cloud" | "torrent";

export interface TorrentSource {
  id: string;
  name: string;
  title: string;
  infoHash: string;
  magnet: string;
  quality: string;
  seeds: number;
  size: string;
  provider: string;
  filename?: string;
  fileIdx?: number;
}

export interface StreamSource {
  url: string;
  quality?: string;
  server?: string;
  language?: string;
  type?: string;
  source?: string;
}

export interface SubtitleResult {
  file: string;
  label: string;
  language: string;
  format: string;
  score?: number;
}

export type WatchlistItem = {
  id: number;
  type: string;
  title: string;
  name?: string;
  poster?: string | null;
  poster_path?: string | null;
  vote?: number;
  vote_average?: number;
  date?: string;
  release_date?: string;
  first_air_date?: string;
  media_type?: string;
  season?: number;
  episode?: number;
  addedAt?: number;
};

export type HistoryItem = {
  id: number;
  type: string;
  title: string;
  name?: string;
  poster?: string | null;
  poster_path?: string | null;
  vote?: number;
  vote_average?: number;
  date?: string;
  release_date?: string;
  first_air_date?: string;
  media_type?: string;
  season?: number;
  episode?: number;
  progress?: number;
  updatedAt?: number;
};

export type ProgressData = {
  itemId: number;
  mediaType: string;
  season?: number;
  episode?: number;
  progress: number;
  updatedAt: number;
};

export interface TMDBResponse<T = MediaItem> {
  page?: number;
  results: T[];
  total_pages?: number;
  total_results?: number;
}

export interface StreamResponse {
  streams?: StreamSource[];
  results?: StreamSource[];
  [key: string]: unknown;
}

export interface CollectionDetail {
  id: number;
  name: string;
  overview?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  parts: MediaItem[];
}

export interface CloudBundle {
  history: HistoryItem[];
  watchlist: WatchlistItem[];
  progress: Record<string, ProgressData>;
  avatar?: string;
  updatedAt?: number;
}

