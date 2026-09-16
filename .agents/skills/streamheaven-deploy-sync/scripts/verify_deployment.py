#!/usr/bin/env python3
"""
StreamHeaven Cross-Tier Deployment Verification
Pings Storefront, Edge Worker, and Render Backend to verify production health.
"""

import sys
import time
import urllib.request
import urllib.error
import json

TARGETS = [
    {
        "name": "Storefront (Cloudflare / Astro)",
        "url": "https://streamheaven.online",
        "expected_status": [200],
        "is_json": False
    },
    {
        "name": "Edge Worker (Cloudflare Workers)",
        "url": "https://streamheaven-edge.sampadchakma22.workers.dev/api/health",
        "expected_status": [200],
        "is_json": True
    },
    {
        "name": "Render Proxy Backend (Node Express)",
        "url": "https://steamheaven.onrender.com/api/health",
        "expected_status": [200],
        "is_json": True
    }
]

def check_target(target):
    name = target["name"]
    url = target["url"]
    start = time.time()
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "StreamHeaven-Deploy-Check/1.0"}
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            elapsed = (time.time() - start) * 1000
            status = resp.status
            cors = resp.headers.get("Access-Control-Allow-Origin", "none")
            content = resp.read()
            
            passed = status in target["expected_status"]
            return {
                "name": name,
                "url": url,
                "passed": passed,
                "status": status,
                "elapsed_ms": int(elapsed),
                "cors": cors,
                "detail": "OK" if passed else f"Unexpected status {status}"
            }
    except urllib.error.HTTPError as e:
        elapsed = (time.time() - start) * 1000
        return {
            "name": name,
            "url": url,
            "passed": False,
            "status": e.code,
            "elapsed_ms": int(elapsed),
            "cors": "N/A",
            "detail": f"HTTPError {e.code}"
        }
    except Exception as e:
        elapsed = (time.time() - start) * 1000
        return {
            "name": name,
            "url": url,
            "passed": False,
            "status": 0,
            "elapsed_ms": int(elapsed),
            "cors": "N/A",
            "detail": str(e)
        }

def main():
    print("=================================================================")
    print(" StreamHeaven Multi-Tier Deployment Health Check")
    print("=================================================================")

    all_passed = True
    results = []

    for t in TARGETS:
        print(f"\nChecking: {t['name']}...")
        res = check_target(t)
        results.append(res)
        
        indicator = "[PASS]" if res["passed"] else "[FAIL]"
        print(f"  {indicator} Status: {res['status']} | Latency: {res['elapsed_ms']}ms | CORS: {res['cors']}")
        if not res["passed"]:
            print(f"         Detail: {res['detail']}")
            all_passed = False

    print("\n=================================================================")
    if all_passed:
        print(" ALL TIERS OPERATIONAL")
    else:
        print(" HEALTH CHECK FAILED ON ONE OR MORE TIERS")
    print("=================================================================")

    sys.exit(0 if all_passed else 1)

if __name__ == "__main__":
    main()
