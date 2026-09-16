#!/usr/bin/env python3
"""
TorrentClaw & Torrent Management CLI for CineCub
Deterministic Layer 3 tool for searching, grabbing, inspecting, and managing torrents.
Works cross-platform (Windows, Linux, macOS) using pure Python stdlib.
"""

import sys
import os
import json
import argparse
import hashlib
import platform
import subprocess
import urllib.request
import urllib.parse
from typing import Dict, Any, List, Optional

# Ensure UTF-8 output encoding on Windows consoles
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

BASE_URL = "https://torrentclaw.com/api/v1"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

# Public fallback trackers
PUBLIC_TRACKERS = [
    "udp://tracker.opentrackr.org:1337/announce",
    "udp://open.stealth.si:80/announce",
    "udp://tracker.torrent.eu.org:451/announce",
    "udp://tracker.openbittorrent.com:6969/announce",
    "udp://opentracker.i2p.rocks:6969/announce",
    "udp://tracker.internetwarriors.net:1337/announce",
    "udp://exodus.desync.com:6969/announce",
    "udp://open.demonii.com:1337/announce",
]

def make_request(url: str, headers: Optional[Dict[str, str]] = None) -> bytes:
    req_headers = {
        "User-Agent": USER_AGENT,
        "x-search-source": "skill",
    }
    if headers:
        req_headers.update(headers)
    
    api_key = os.environ.get("TORRENTCLAW_API_KEY")
    if api_key:
        req_headers["Authorization"] = f"Bearer {api_key}"

    req = urllib.request.Request(url, headers=req_headers)
    with urllib.request.urlopen(req, timeout=15) as resp:
        return resp.read()


def search_content(
    query: str,
    content_type: Optional[str] = None,
    quality: Optional[str] = None,
    genre: Optional[str] = None,
    year_min: Optional[int] = None,
    year_max: Optional[int] = None,
    min_rating: Optional[float] = None,
    lang: Optional[str] = None,
    audio: Optional[str] = None,
    hdr: Optional[str] = None,
    season: Optional[int] = None,
    episode: Optional[int] = None,
    sort: str = "seeders",
    limit: int = 10,
    page: int = 1
) -> Dict[str, Any]:
    params = {
        "q": query,
        "sort": sort,
        "limit": str(limit),
        "page": str(page),
    }
    if content_type:
        params["type"] = content_type
    if quality:
        params["quality"] = quality
    if genre:
        params["genre"] = genre
    if year_min:
        params["year_min"] = str(year_min)
    if year_max:
        params["year_max"] = str(year_max)
    if min_rating:
        params["min_rating"] = str(min_rating)
    if lang:
        params["lang"] = lang
    if audio:
        params["audio"] = audio
    if hdr:
        params["hdr"] = hdr
    if season:
        params["season"] = str(season)
    if episode:
        params["episode"] = str(episode)

    url = f"{BASE_URL}/search?{urllib.parse.urlencode(params)}"
    data = make_request(url)
    return json.loads(data.decode("utf-8"))


def download_torrent_file(info_hash: str, output_path: str) -> str:
    url = f"{BASE_URL}/torrent/{info_hash.strip().lower()}"
    raw_data = make_request(url)
    with open(output_path, "wb") as f:
        f.write(raw_data)
    return os.path.abspath(output_path)


# Pure-Python Bdecode
def bdecode(data: bytes) -> Any:
    def decode_item(idx: int):
        char = data[idx:idx+1]
        if char == b'i':
            end = data.index(b'e', idx)
            return int(data[idx+1:end]), end + 1
        elif char == b'l':
            idx += 1
            items = []
            while data[idx:idx+1] != b'e':
                item, idx = decode_item(idx)
                items.append(item)
            return items, idx + 1
        elif char == b'd':
            idx += 1
            d = {}
            while data[idx:idx+1] != b'e':
                key, idx = decode_item(idx)
                val, idx = decode_item(idx)
                if isinstance(key, bytes):
                    key = key.decode("utf-8", errors="replace")
                d[key] = val
            return d, idx + 1
        elif char.isdigit():
            colon = data.index(b':', idx)
            length = int(data[idx:colon])
            start = colon + 1
            end = start + length
            return data[start:end], end
        else:
            raise ValueError(f"Invalid bencode token at index {idx}: {char}")

    result, _ = decode_item(0)
    return result


def inspect_torrent_file(file_path: str) -> Dict[str, Any]:
    with open(file_path, "rb") as f:
        data = f.read()

    decoded = bdecode(data)
    info = decoded.get("info", {})

    # Calculate info_hash: find the raw bytes of 'info' dict in data
    info_start = data.find(b'4:info') + 6
    # Or serialize info if not easily sliced
    info_hash = ""
    try:
        # crude slice extraction or standard hash
        raw_info = data[info_start:]
        # Find ending of dict
        info_hash = hashlib.sha1(data).hexdigest()  # fallback
    except Exception:
        pass

    files = []
    total_size = 0
    if "files" in info:
        for fi in info["files"]:
            length = fi.get("length", 0)
            total_size += length
            path_parts = [p.decode("utf-8", errors="replace") if isinstance(p, bytes) else str(p) for p in fi.get("path", [])]
            files.append({
                "path": "/".join(path_parts),
                "size_bytes": length,
                "size_mb": round(length / (1024 * 1024), 2)
            })
    elif "length" in info:
        length = info.get("length", 0)
        total_size = length
        name = info.get("name", b"").decode("utf-8", errors="replace")
        files.append({
            "path": name,
            "size_bytes": length,
            "size_mb": round(length / (1024 * 1024), 2)
        })

    name = info.get("name", b"").decode("utf-8", errors="replace") if isinstance(info.get("name"), bytes) else str(info.get("name", "Unknown"))
    piece_length = info.get("piece length", 0)

    announce = decoded.get("announce", b"")
    if isinstance(announce, bytes):
        announce = announce.decode("utf-8", errors="replace")

    announce_list = []
    if "announce-list" in decoded:
        for tier in decoded["announce-list"]:
            for tr in tier:
                if isinstance(tr, bytes):
                    announce_list.append(tr.decode("utf-8", errors="replace"))
                else:
                    announce_list.append(str(tr))

    return {
        "name": name,
        "total_size_bytes": total_size,
        "total_size_mb": round(total_size / (1024 * 1024), 2),
        "piece_length": piece_length,
        "file_count": len(files),
        "files": files[:50],  # show top 50 files
        "announce": announce,
        "announce_list": announce_list or [announce] if announce else []
    }


def detect_torrent_clients() -> Dict[str, Any]:
    os_name = platform.system()
    detected = {
        "os": os_name,
        "clients": {
            "qbittorrent": {"installed": False, "web_ui": False},
            "transmission": {"installed": False, "daemon": False},
            "aria2": {"installed": False, "rpc": False},
        },
        "default_shell_handler": False
    }

    # Test aria2
    try:
        req = urllib.request.Request(
            "http://localhost:6800/jsonrpc",
            data=json.dumps({"jsonrpc": "2.0", "id": "test", "method": "aria2.getVersion"}).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=1) as resp:
            if resp.status == 200:
                detected["clients"]["aria2"]["installed"] = True
                detected["clients"]["aria2"]["rpc"] = True
    except Exception:
        pass

    # Test transmission
    try:
        req = urllib.request.Request("http://localhost:9091/transmission/rpc")
        with urllib.request.urlopen(req, timeout=1) as resp:
            detected["clients"]["transmission"]["installed"] = True
            detected["clients"]["transmission"]["daemon"] = True
    except urllib.error.HTTPError as e:
        if e.code == 409:  # Transmission returns 409 Conflict with X-Transmission-Session-Id header
            detected["clients"]["transmission"]["installed"] = True
            detected["clients"]["transmission"]["daemon"] = True
    except Exception:
        pass

    # Test qbittorrent web UI
    try:
        req = urllib.request.Request("http://localhost:8080/api/v2/app/version")
        with urllib.request.urlopen(req, timeout=1) as resp:
            if resp.status in (200, 403):  # 403 means auth required but server is active
                detected["clients"]["qbittorrent"]["installed"] = True
                detected["clients"]["qbittorrent"]["web_ui"] = True
    except Exception:
        pass

    # Check CLI binaries on PATH
    for bin_name in ["transmission-remote", "aria2c", "qbittorrent"]:
        try:
            cmd = "where" if os_name == "Windows" else "which"
            res = subprocess.run([cmd, bin_name], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if res.returncode == 0 and res.stdout.strip():
                if "transmission" in bin_name:
                    detected["clients"]["transmission"]["installed"] = True
                elif "aria2" in bin_name:
                    detected["clients"]["aria2"]["installed"] = True
                elif "qbittorrent" in bin_name:
                    detected["clients"]["qbittorrent"]["installed"] = True
        except Exception:
            pass

    if os_name == "Windows":
        detected["default_shell_handler"] = True  # Can launch default client with os.startfile()

    return detected


def dispatch_magnet(magnet_url: str, client: Optional[str] = None) -> Dict[str, Any]:
    clients = detect_torrent_clients()
    os_name = platform.system()

    if client == "aria2" or (not client and clients["clients"]["aria2"]["rpc"]):
        try:
            req_data = json.dumps({
                "jsonrpc": "2.0",
                "id": "add-magnet",
                "method": "aria2.addUri",
                "params": [[magnet_url]]
            }).encode("utf-8")
            req = urllib.request.Request("http://localhost:6800/jsonrpc", data=req_data, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=5) as resp:
                res = json.loads(resp.read().decode("utf-8"))
                return {"status": "success", "client": "aria2", "gid": res.get("result")}
        except Exception as e:
            return {"status": "error", "client": "aria2", "error": str(e)}

    # Fallback to system default handler
    if os_name == "Windows":
        try:
            os.startfile(magnet_url)
            return {"status": "success", "client": "windows_default", "message": "Dispatched to Windows default torrent client"}
        except Exception as e:
            return {"status": "error", "error": str(e)}
    elif os_name == "Darwin":
        subprocess.run(["open", magnet_url])
        return {"status": "success", "client": "macos_default"}
    else:
        subprocess.run(["xdg-open", magnet_url])
        return {"status": "success", "client": "linux_default"}


def format_search_results(results: Dict[str, Any]) -> str:
    items = results.get("results", [])
    if not items:
        return "No torrents found matching the criteria."

    lines = []
    lines.append(f"Found {results.get('total', len(items))} titles (Page {results.get('page', 1)}/{results.get('pageSize', 20)}):\n")
    for i, item in enumerate(items, 1):
        title = item.get("title", "Unknown")
        year = item.get("year", "")
        ctype = item.get("contentType", "movie").capitalize()
        rating = item.get("ratingImdb") or item.get("ratingTmdb") or "N/A"
        torrents = item.get("torrents", [])
        
        lines.append(f"{i}. 🎬 {title} ({year}) — {ctype} | ⭐ IMDb: {rating}")
        if not torrents:
            lines.append("   (No direct torrent streams associated)")
            continue
        
        for j, t in enumerate(torrents[:4], 1):
            quality = t.get("quality", "HD")
            codec = t.get("codec", "")
            source_type = t.get("sourceType") or t.get("source", "")
            size_bytes = int(t.get("sizeBytes", 0) or 0)
            size_gb = f"{size_bytes / (1024**3):.2f} GB" if size_bytes > 1024**3 else f"{size_bytes / (1024**2):.1f} MB"
            seeds = t.get("seeders", 0)
            info_hash = t.get("infoHash", "")
            score = t.get("qualityScore", 0)
            lines.append(f"   [{chr(96+j)}] {quality} {codec} {source_type} — {size_gb} | 🟢 {seeds} seeds | Score: {score}")
            lines.append(f"       Hash: {info_hash}")
        lines.append("")
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="TorrentClaw & Torrent Management CLI for CineCub")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # Search
    search_parser = subparsers.add_parser("search", help="Search media and torrents")
    search_parser.add_argument("query", help="Search query (movie, series, anime)")
    search_parser.add_argument("--type", choices=["movie", "show"], help="Filter by content type")
    search_parser.add_argument("--quality", choices=["480p", "720p", "1080p", "2160p"], help="Filter by resolution")
    search_parser.add_argument("--genre", help="Filter by genre")
    search_parser.add_argument("--season", type=int, help="Filter by season")
    search_parser.add_argument("--episode", type=int, help="Filter by episode")
    search_parser.add_argument("--sort", default="seeders", choices=["seeders", "relevance", "year", "rating", "added"])
    search_parser.add_argument("--limit", type=int, default=5, help="Number of results")
    search_parser.add_argument("--json", action="store_true", help="Output raw JSON")

    # Download .torrent
    dl_parser = subparsers.add_parser("download", help="Download .torrent file by infoHash")
    dl_parser.add_argument("info_hash", help="40-character hex info hash")
    dl_parser.add_argument("-o", "--output", default="download.torrent", help="Output file path")

    # Inspect .torrent
    inspect_parser = subparsers.add_parser("inspect", help="Inspect .torrent file contents")
    inspect_parser.add_argument("torrent_file", help="Path to .torrent file")

    # Detect clients
    subparsers.add_parser("detect", help="Detect installed torrent clients")

    # Add magnet
    add_parser = subparsers.add_parser("add", help="Add magnet link to client")
    add_parser.add_argument("magnet", help="Magnet URL")
    add_parser.add_argument("--client", choices=["aria2", "transmission", "qbittorrent"], help="Target client")

    args = parser.parse_args()

    if args.command == "search":
        res = search_content(
            query=args.query,
            content_type=args.type,
            quality=args.quality,
            genre=args.genre,
            season=args.season,
            episode=args.episode,
            sort=args.sort,
            limit=args.limit
        )
        if args.json:
            print(json.dumps(res, indent=2))
        else:
            print(format_search_results(res))

    elif args.command == "download":
        saved = download_torrent_file(args.info_hash, args.output)
        print(f"Torrent saved to: {saved}")

    elif args.command == "inspect":
        info = inspect_torrent_file(args.torrent_file)
        print(json.dumps(info, indent=2))

    elif args.command == "detect":
        det = detect_torrent_clients()
        print(json.dumps(det, indent=2))

    elif args.command == "add":
        out = dispatch_magnet(args.magnet, client=args.client)
        print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
