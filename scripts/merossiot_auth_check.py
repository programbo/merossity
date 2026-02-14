#!/usr/bin/env python3
"""
Authenticate using the upstream MerossIot Python library (meross_iot) to
determine whether login failures are account-side or implementation-side.

Usage (recommended: keep secrets out of shell history):
  python3 scripts/merossiot_auth_check.py --email you@example.com --password-env MEROSS_PW --mfa-env MEROSS_TOTP

Or (direct args):
  python3 scripts/merossiot_auth_check.py --email you@example.com --password '...' --mfa-token 123456
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
from typing import Any, Dict, List, Optional


REGION_BASE_URLS: Dict[str, str] = {
    "global": "https://iotx.meross.com",
    "us": "https://iotx-us.meross.com",
    "eu": "https://iotx-eu.meross.com",
    "ap": "https://iotx-ap.meross.com",
}


def _redact(s: str, keep: int = 4) -> str:
    s = s or ""
    if len(s) <= keep * 2:
        return "*" * len(s)
    return f"{s[:keep]}…{s[-keep:]}"


def _get_env(name: str) -> str:
    v = os.environ.get(name, "")
    if not v:
        raise SystemExit(f"Missing required env var: {name}")
    return v


def _coerce_totp(v: str) -> str:
    v = (v or "").strip()
    digits = "".join(ch for ch in v if ch.isdigit())
    if len(digits) != 6:
        raise SystemExit(f"Invalid MFA token. Expected 6 digits, got: {v!r}")
    return digits


async def _try_login(
    api_base_url: str,
    email: str,
    password: str,
    mfa_code: Optional[str],
    auto_retry_on_bad_domain: bool,
    timeout_s: float,
) -> Dict[str, Any]:
    started = time.time()
    out: Dict[str, Any] = {
        "api_base_url": api_base_url,
        "ok": False,
        "elapsed_ms": None,
        "error_type": None,
        "error": None,
        "details": None,
        "creds": None,
        "devices_count": None,
    }

    try:
        from meross_iot.http_api import MerossHttpClient
    except Exception as e:  # noqa: BLE001
        raise SystemExit(
            "Missing dependency: meross_iot. Install with:\n"
            "  python3 -m venv .venv && source .venv/bin/activate && python -m pip install meross_iot==0.4.10.3"
        ) from e

    client = None
    try:
        # NOTE: meross_iot handles the exact Meross signing protocol and uses its own headers/app identifiers.
        # This is the baseline we want to compare against.
        client = await asyncio.wait_for(
            MerossHttpClient.async_from_user_password(
                api_base_url=api_base_url,
                email=email,
                password=password,
                mfa_code=mfa_code,
                auto_retry_on_bad_domain=auto_retry_on_bad_domain,
            ),
            timeout=timeout_s,
        )

        # cloud_credentials is a MerossCloudCreds object (has to_json()).
        creds_json = None
        if getattr(client, "cloud_credentials", None) is not None:
            try:
                creds_json = client.cloud_credentials.to_json()
            except Exception:
                creds_json = None

        # Try to list devices to validate the session is actually usable.
        devices = await asyncio.wait_for(client.async_list_devices(), timeout=timeout_s)
        devices_count = len(devices) if isinstance(devices, list) else None

        out["ok"] = True
        out["devices_count"] = devices_count

        if creds_json is not None:
            # Redact token/key-like fields if present.
            redacted = dict(creds_json) if isinstance(creds_json, dict) else {"raw": creds_json}
            for k in list(redacted.keys()):
                if k.lower() in ("token", "key", "userid", "user_id", "userid"):
                    v = str(redacted.get(k, ""))
                    redacted[k] = _redact(v)
            out["creds"] = redacted
    except Exception as e:  # noqa: BLE001
        out["error_type"] = type(e).__name__
        out["error"] = str(e)
    finally:
        out["elapsed_ms"] = int((time.time() - started) * 1000)
        try:
            if client is not None:
                await client.async_logout()
        except Exception:
            pass

    return out


async def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--email", required=True)

    pw = p.add_mutually_exclusive_group(required=False)
    pw.add_argument("--password", default="")
    pw.add_argument("--password-env", default="")

    mfa = p.add_mutually_exclusive_group(required=False)
    mfa.add_argument("--mfa-token", default="")
    mfa.add_argument("--mfa-env", default="")

    p.add_argument("--region", choices=["auto", "global", "us", "eu", "ap"], default="auto")
    p.add_argument("--api-base-url", default="", help="Override API base URL (e.g. https://iotx-us.meross.com)")
    p.add_argument("--try-all", action="store_true", help="Try all candidate endpoints even after success")
    p.add_argument("--no-auto-retry", action="store_true", help="Disable meross_iot auto retry on bad domain")
    p.add_argument("--timeout-s", type=float, default=20.0)
    args = p.parse_args()

    email = args.email.strip()
    password = args.password if args.password else (_get_env(args.password_env) if args.password_env else "")
    if not password:
        raise SystemExit("Missing password. Provide --password or --password-env <ENV_NAME>.")

    mfa_raw = args.mfa_token if args.mfa_token else (_get_env(args.mfa_env) if args.mfa_env else "")
    mfa_code = _coerce_totp(mfa_raw) if mfa_raw else None

    auto_retry = not args.no_auto_retry

    if args.api_base_url:
        candidates = [args.api_base_url]
    else:
        ordered: List[str] = []
        if args.region != "auto":
            ordered.append(REGION_BASE_URLS[args.region])
        else:
            # Reasonable default ordering; can refine if needed.
            ordered.extend(
                [
                    REGION_BASE_URLS["us"],
                    REGION_BASE_URLS["eu"],
                    REGION_BASE_URLS["ap"],
                    REGION_BASE_URLS["global"],
                ]
            )
        # De-dupe while preserving order
        seen = set()
        candidates = []
        for u in ordered:
            if u in seen:
                continue
            seen.add(u)
            candidates.append(u)

    results: List[Dict[str, Any]] = []
    success = None
    for api_base_url in candidates:
        r = await _try_login(
            api_base_url=api_base_url,
            email=email,
            password=password,
            mfa_code=mfa_code,
            auto_retry_on_bad_domain=auto_retry,
            timeout_s=args.timeout_s,
        )
        results.append(r)
        if r.get("ok"):
            success = r
            if not args.try_all:
                break

    print(
        json.dumps(
            {
                "email": email,
                "password_len": len(password),
                "mfa_present": bool(mfa_code),
                "auto_retry_on_bad_domain": auto_retry,
                "candidates": candidates,
                "results": results,
                "success": success,
            },
            indent=2,
        )
    )

    return 0 if success else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

