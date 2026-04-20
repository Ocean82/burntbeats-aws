#!/usr/bin/env python3
"""Post-deploy smoke checks for burntbeats.com.

Usage:
  python scripts/post_deploy_smoke.py
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


REPORT_DIR = Path("docs/deploy-reports")


@dataclass
class CheckResult:
    name: str
    ok: bool
    details: str


def fetch(url: str, method: str = "GET", timeout: float = 15.0) -> tuple[int, str]:
    req = Request(
        url=url,
        method=method,
        headers={
            "User-Agent": "burntbeats-post-deploy-smoke/1.0",
            "Accept": "*/*",
        },
    )
    try:
        with urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            return int(resp.status), body
    except HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        return int(e.code), body
    except URLError as e:
        raise RuntimeError(f"Network error for {url}: {e}") from e


def run_checks() -> Iterable[CheckResult]:
    status, body = fetch("https://burntbeats.com/sitemap.xml")
    yield CheckResult(
        name="sitemap.xml status",
        ok=status == 200,
        details=f"status={status}",
    )
    required_sitemap_paths = [
        "https://burntbeats.com/privacy-policy",
        "https://burntbeats.com/terms-of-service",
        "https://www.burntbeats.com/pricing",
    ]
    missing = [p for p in required_sitemap_paths if p not in body]
    yield CheckResult(
        name="sitemap.xml required URLs",
        ok=len(missing) == 0,
        details="missing=" + (", ".join(missing) if missing else "none"),
    )

    status, body = fetch("https://burntbeats.com/robots.txt")
    yield CheckResult(
        name="robots.txt status",
        ok=status == 200,
        details=f"status={status}",
    )
    yield CheckResult(
        name="robots.txt has sitemap line",
        ok="Sitemap: https://burntbeats.com/sitemap.xml" in body,
        details="sitemap_line_present="
        + ("yes" if "Sitemap: https://burntbeats.com/sitemap.xml" in body else "no"),
    )

    status, _ = fetch("https://burntbeats.com/pricing")
    # urllib follows redirects by default; healthy result can be 200 (after /pricing -> /pricing/).
    yield CheckResult(
        name="/pricing redirect status",
        ok=status in (200, 301, 302, 307, 308),
        details=f"status={status}",
    )

    status, _ = fetch("https://burntbeats.com/privacy-policy")
    yield CheckResult(
        name="/privacy-policy status",
        ok=status == 200,
        details=f"status={status}",
    )

    status, _ = fetch("https://burntbeats.com/terms-of-service")
    yield CheckResult(
        name="/terms-of-service status",
        ok=status == 200,
        details=f"status={status}",
    )


def write_report(results: list[CheckResult]) -> Path:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc)
    stamp = now.strftime("%Y-%m-%d_%H%M%S_UTC")
    path = REPORT_DIR / f"post-deploy-smoke-{stamp}.md"
    passed = sum(1 for r in results if r.ok)
    total = len(results)

    lines = [
        "# Post-Deploy Smoke Report",
        "",
        f"- **Timestamp (UTC):** {now.isoformat()}",
        f"- **Passed:** {passed}/{total}",
        "",
        "## Checks",
        "",
    ]
    for r in results:
        mark = "PASS" if r.ok else "FAIL"
        lines.append(f"- **{mark}** `{r.name}` — {r.details}")
    lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


def main() -> int:
    results = list(run_checks())
    report_path = write_report(results)

    passed = sum(1 for r in results if r.ok)
    total = len(results)
    print(f"Smoke checks complete: {passed}/{total} passed")
    print(f"Report: {report_path.as_posix()}")
    for r in results:
        mark = "PASS" if r.ok else "FAIL"
        print(f"[{mark}] {r.name}: {r.details}")

    return 0 if passed == total else 1


if __name__ == "__main__":
    raise SystemExit(main())

