#!/usr/bin/env python3
"""Stamp the date the site content last changed into site/index.html.

Called by the Pages workflow with the date of the last commit that touched
site/. Deliberately not the build time: a deploy that changed nothing should
not claim the page is newer than it is.
"""
import json
import re
import subprocess
import sys
from datetime import date

PAGE = "site/index.html"


def content_date() -> str:
    if len(sys.argv) > 1:
        return sys.argv[1]
    out = subprocess.run(
        ["git", "log", "-1", "--format=%cs", "--", "site/"],
        capture_output=True, text=True, check=False,
    ).stdout.strip()
    return out or date.today().isoformat()


def human(iso: str) -> str:
    y, m, d = (int(part) for part in iso.split("-"))
    months = ("January", "February", "March", "April", "May", "June", "July",
              "August", "September", "October", "November", "December")
    return f"{d} {months[m - 1]} {y}"


def main() -> None:
    iso = content_date()
    page = open(PAGE).read()

    page = re.sub(
        r'<time datetime="[^"]*" id="updated">[^<]*</time>',
        f'<time datetime="{iso}" id="updated">{human(iso)}</time>',
        page,
    )

    def stamp(match: "re.Match[str]") -> str:
        data = json.loads(match.group(1))
        if data.get("@type") in ("SoftwareApplication", "WebSite"):
            data["dateModified"] = iso
        return '<script type="application/ld+json">\n' + json.dumps(data, indent=2) + "\n</script>"

    page = re.sub(r'<script type="application/ld\+json">(.*?)</script>', stamp, page, flags=re.S)
    open(PAGE, "w").write(page)
    print(f"stamped {iso}")


if __name__ == "__main__":
    main()
