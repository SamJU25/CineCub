#!/usr/bin/env python3
"""
StreamHeaven Stream Diagnostic Tool
Tests stream resolution from Render backend or Cloudflare Edge Worker.
Verifies HTTP status, CORS headers, Content-Type, and media byte streaming.
"""

import argparse
import json
import sys
import time
import urllib.request
import urllib.parse
import urllib.error

RENDER_BASE = "https://steamheaven.onrender.com"
EDGE_BASE = "https://streamheaven-edge.sampadchakma22.workers.dev"

def fetch_json(url, timeout=25):
    start = time.time()
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "StreamHeaven-Diagnostics/1.0", "Accept": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = resp.read()
            elapsed = time.time() - start
            return resp.status, json.loads(data.decode("utf-8")), elapsed
    except urllib.error.HTTPError as e:
        elapsed = time.time() - start
        return e.code, str(e), elapsed
    except Exception as e:
        elapsed = time.time() - start
        return 0, str(e), elapsed

def test_media_url(url, timeout=10):
    start = time.time()
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Range": "bytes=0-1024"
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            elapsed = time.time() - start
            return {
                "status": resp.status,
                "content_type": resp.headers.get("Content-Type", "unknown"),
                "cors": resp.headers.get("Access-Control-Allow-Origin", "none"),
                "accept_ranges": resp.headers.get("Accept-Ranges", "none"),
                "content_length": resp.headers.get("Content-Length", "unknown"),
                "elapsed_ms": int(elapsed * 1000)
            }
    except urllib.error.HTTPError as e:
        return {"status": e.code, "error": str(e)}
    except Exception as e:
        return {"status": 0, "error": str(e)}

def main():
    parser = argparse.ArgumentParser(description="StreamHeaven Stream Diagnostic Tool")
    parser.add_argument("--type", choices=["movie", "series"], default="movie", help="Media type (movie or series)")
    parser.add_argument("--id", default="693134", help="TMDB ID (default: 693134 Dune Part Two)")
    parser.add_argument("--season", default="1", help="Season number (series only)")
    parser.add_argument("--episode", default="1", help="Episode number (series only)")
    parser.add_argument("--target", choices=["render", "edge"], default="render", help="Target API backend")
    parser.add_argument("--local", action="store_true", help="Use localhost instead of live remote")
    parser.add_argument("--check-media", action="store_true", help="Probe first 3 stream URLs with byte-range requests")
    args = parser.parse_args()

    if args.local:
        base_url = "http://localhost:3000" if args.target == "render" else "http://localhost:8787"
    else:
        base_url = RENDER_BASE if args.target == "render" else EDGE_BASE

    print("=================================================================")
    print(f" StreamHeaven Diagnostic Run")
    print(f" Target: {base_url} ({args.target.upper()})")
    print(f" Media:  {args.type.upper()} ID: {args.id} (S{args.season}E{args.episode})")
    print("=================================================================")

    # 1. Health check
    health_url = f"{base_url}/api/health"
    print(f"\n[1] Pinging health endpoint: {health_url}")
    h_status, h_data, h_time = fetch_json(health_url, timeout=30)
    print(f"    Status: {h_status} (took {h_time:.2f}s)")
    if h_status != 200:
        print(f"    WARNING: Health check failed or backend waking up: {h_data}")
    else:
        print(f"    Response: {h_data}")

    # 2. Query streams
    if args.type == "movie":
        stream_url = f"{base_url}/api/streams/movie/{args.id}"
    else:
        stream_url = f"{base_url}/api/streams/series/{args.id}?season={args.season}&episode={args.episode}"

    print(f"\n[2] Fetching stream sources: {stream_url}")
    s_status, s_data, s_time = fetch_json(stream_url, timeout=35)
    print(f"    Status: {s_status} (took {s_time:.2f}s)")

    if s_status != 200:
        print(f"    ERROR: Stream fetch returned status {s_status}: {s_data}")
        sys.exit(1)

    if isinstance(s_data, dict) and "streams" in s_data:
        streams = s_data["streams"]
        print(f"    Found {len(streams)} total streams (count reported: {s_data.get('count', len(streams))}).")
        if "providerTimings" in s_data:
            print(f"    Provider timings: {json.dumps(s_data['providerTimings'])}")
    elif isinstance(s_data, list):
        streams = s_data
        print(f"    Found {len(streams)} total streams.")
    else:
        print(f"    ERROR: Unexpected response format: {type(s_data)}")
        sys.exit(1)

    # 3. Categorize streams
    file_streams = []
    hls_streams = []
    other_streams = []

    for idx, s in enumerate(streams):
        url = s.get("url", "")
        provider = s.get("provider", "unknown")
        quality = s.get("quality", "unknown")
        title = s.get("title", f"Stream #{idx+1}")
        
        is_file = "/ts-proxy" in url or any(url.endswith(ext) for ext in [".mp4", ".mkv", ".webm", ".mov"])
        is_hls = "/m3u8-proxy" in url or ".m3u8" in url

        info = {
            "index": idx,
            "provider": provider,
            "quality": quality,
            "title": title,
            "url": url,
            "is_file": is_file,
            "is_hls": is_hls
        }

        if is_file:
            file_streams.append(info)
        elif is_hls:
            hls_streams.append(info)
        else:
            other_streams.append(info)

    print(f"\n    Breakdown:")
    print(f"    - Direct File Streams (MP4/MKV via /ts-proxy): {len(file_streams)}")
    print(f"    - HLS Manifest Streams (/m3u8-proxy):          {len(hls_streams)}")
    print(f"    - Other / Embed Streams:                      {len(other_streams)}")

    if file_streams:
        print("\n    Top File Stream:")
        print(f"      Provider: {file_streams[0]['provider']} ({file_streams[0]['quality']})")
        print(f"      URL:      {file_streams[0]['url'][:100]}...")

    # 4. Optional media probe
    if args.check_media and streams:
        print("\n[3] Probing top stream URLs with Range request (0-1024 bytes)...")
        sample = streams[:3]
        for i, stream in enumerate(sample):
            target_url = stream.get("url")
            if not target_url:
                continue
            res = test_media_url(target_url)
            print(f"    Stream #{i+1} ({stream.get('provider', 'unknown')}):")
            print(f"      Status:       {res.get('status')}")
            print(f"      Content-Type: {res.get('content_type', 'N/A')}")
            print(f"      CORS:         {res.get('cors', 'N/A')}")
            print(f"      Latency:      {res.get('elapsed_ms', 'N/A')} ms")

    print("\n=================================================================")
    print(" Diagnostic Complete.")
    print("=================================================================")

if __name__ == "__main__":
    main()
