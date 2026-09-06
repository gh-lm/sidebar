#!/usr/bin/env python3
"""Writes the five legal pages from one template.

Kept as a generator rather than five hand-maintained files: the sub-footer,
the company details and the styling have to be identical on all of them, and
five copies of anything drift. Re-run after editing the text below.
"""
import pathlib

SITE = pathlib.Path(__file__).resolve().parent.parent / "site"
COMPANY_NO = "17423646"
OFFICE = "82A James Carter Road, Mildenhall, IP28 7DE"
DATE_ISO = "2026-09-06"
DATE_HUMAN = "6 September 2026"

PAGES = [
    ("privacy", "Privacy", "Privacy statement",
     "What Lightmorphic Sidebar stores, where it stores it, and why it sends nothing anywhere."),
    ("cookies", "Cookies", "Cookies",
     "This site sets no cookies at all, and the extension sets none either."),
    ("terms", "Terms", "Terms of use",
     "The terms the extension and this site are provided under."),
    ("accessibility", "Accessibility", "Accessibility",
     "How accessible this site and the extension are, and how to tell us when they are not."),
    ("complaints", "Complaints", "Complaints",
     "How to complain, what happens next, and where to go if we do not put it right."),
]

BODIES = {
    "privacy": """
<p class="lede">Lightmorphic Sidebar collects nothing, sends nothing, and has no server.</p>

<h2>What it stores, and where</h2>
<p>Your scratchpad, snippets and pinned sites are saved as ordinary bookmarks, in a folder called &quot;Lightmorphic Sidebar&quot; in your Other Bookmarks, with a copy in the browser's extension storage. The extension itself sends nothing anywhere: there is no account, no server of ours, and no network request of any kind to us.</p>

<h2>Syncing</h2>
<p>Because that data is bookmarks, your browser's own sync carries it to your other machines, exactly as it carries the rest of your bookmarks, under whatever settings and encryption your browser provides, between you and your browser maker. We are not involved and cannot see it. If you do not sync bookmarks, nothing leaves the machine. Deleting the folder deletes the data.</p>

<h2>Snippets and the page you are on</h2>
<p>Clicking a snippet copies it and, if you have granted access to that site, inserts it at your cursor. It writes your own text in and reads nothing out. No page content, no form values. Decline the permission and the snippet is still on your clipboard to paste yourself.</p>

<h2>Website access</h2>
<p>The extension installs with access to no websites. The first time you open a pinned site in the panel, the browser asks whether to grant access to that site and its subdomains. This is needed because showing a site in a panel means removing the headers that normally stop it being framed. You can decline, and the site opens in an ordinary tab instead. You can withdraw access at any time from the browser's extension settings.</p>

<h2>What it reads about your browsing</h2>
<p>When you press &quot;+&quot; to pin a site, it reads the address of the tab you are on so it can fill that address in for you. It is shown on screen, saved only if you press Save, and used nowhere else. The extension does not read page content, and keeps no history of where you go.</p>

<h2>Site icons</h2>
<p>A pinned site's icon comes from your browser's own cache. Where the browser has none — a site you have never opened in a tab — the icon is fetched from that site itself, and from nowhere else. No icon service is used, because using one would tell a third party every site you have pinned.</p>

<h2>No third parties</h2>
<p>No analytics, no tracking, no remote code, no external fonts or images, and no requests to any service, including ours.</p>

<h2>This website</h2>
<p>This site is served as static files by GitHub Pages. It sets no cookies and runs no analytics. GitHub processes the request in order to serve the page, and its logs are outside our control; see the <a href="https://docs.github.com/site-policy/privacy-policies/github-privacy-statement">GitHub privacy statement</a>. The only script the site loads from elsewhere is our own applications launcher, from apps.lightmorphic.com.</p>

<h2>Your rights</h2>
<p>We hold no personal data about you, so there is nothing for us to show you, correct or delete. If you write to us, we keep that message only as long as it takes to answer you. You can complain to the Information Commissioner's Office at <a href="https://ico.org.uk">ico.org.uk</a>.</p>

<h2>Asking us</h2>
<p>Questions about this statement: <a href="mailto:privacy@lightmorphic.com">privacy@lightmorphic.com</a>.</p>
""",
    "cookies": """
<p class="lede">This site sets no cookies. The extension sets none either.</p>

<h2>What that means</h2>
<p>There is no cookie banner on this site because there is nothing to consent to. No analytics, no advertising, no tracking of any kind, and nothing stored on your machine by us when you read these pages.</p>

<h2>The extension</h2>
<p>Lightmorphic Sidebar stores what you save in your own bookmarks and in the browser's extension storage. Neither is a cookie, neither is sent anywhere, and both are yours to delete: remove the &quot;Lightmorphic Sidebar&quot; folder from your bookmarks, or remove the extension.</p>

<h2>Sites you open in the panel</h2>
<p>A website opened inside the panel is a real visit to that website. It can set its own cookies exactly as it would in a tab, under your browser's own cookie settings. Those are that site's cookies, not ours, and we cannot see them.</p>

<h2>Asking us</h2>
<p>Questions about this page: <a href="mailto:privacy@lightmorphic.com">privacy@lightmorphic.com</a>.</p>
""",
    "terms": """
<p class="lede">Lightmorphic Sidebar is free, and its source is published.</p>

<h2>Using it</h2>
<p>You may install and use the extension for anything you like, personal or commercial, on as many machines as you like. There is nothing to pay and no account to make.</p>

<h2>What we promise</h2>
<p>Nothing, in the legal sense. The extension is provided as it is, without warranty of any kind. We do not promise it will suit a particular purpose, work without interruption, or be free of faults. Your data lives in your own bookmarks, and keeping a backup of anything you would mind losing is your responsibility.</p>

<h2>What we are liable for</h2>
<p>To the fullest extent the law allows, we are not liable for loss of data, loss of profit, or any indirect loss arising from using the extension or this site. Nothing here limits liability for death or personal injury caused by negligence, for fraud, or for anything else that cannot lawfully be limited. If you are a consumer, your statutory rights are unaffected.</p>

<h2>Sites you open in the panel</h2>
<p>Opening a website in the panel is a visit to that website, governed by that site's own terms. We are not responsible for what other sites do, show, or store.</p>

<h2>Changes</h2>
<p>We may change the extension or these terms. Material changes will be noted by the date at the foot of this page. Continuing to use the extension after a change means accepting it.</p>

<h2>Law</h2>
<p>These terms are governed by the law of England and Wales, and the courts of England and Wales have jurisdiction.</p>

<h2>Asking us</h2>
<p>Questions about these terms: <a href="mailto:terms@lightmorphic.com">terms@lightmorphic.com</a>.</p>
""",
    "accessibility": """
<p class="lede">We want this usable by keyboard, by screen reader, and at whatever text size suits you.</p>

<h2>How this site is built</h2>
<p>Plain HTML and CSS, no framework. Every control is a real button or link and can be reached and operated by keyboard. Headings are in order, images that carry meaning have text alternatives, and the page reflows to a phone without side-to-side scrolling. Colours are checked against the WCAG 2.2 AA contrast minimum.</p>

<h2>How the extension is built</h2>
<p>The panel's sections are tabs that can be reached by keyboard, and its buttons carry labels for a screen reader rather than relying on their icons. The panel is dark throughout, at a contrast we have measured rather than guessed.</p>

<h2>Where it falls short</h2>
<p>A website opened inside the panel is that website, with its own accessibility, good or bad. We can ask it for its phone layout; we cannot fix it. The panel is also as narrow as the browser allows a side panel to be, which suits some content badly — the Open button hands any page to a full browser tab for that reason.</p>

<h2>Telling us</h2>
<p>If something here is hard or impossible to use, please say so, and say what you were trying to do. Write to <a href="mailto:complaints@lightmorphic.com">complaints@lightmorphic.com</a>. We aim to reply within five working days.</p>

<h2>Enforcement</h2>
<p>If you are not happy with our response, the Equality Advisory and Support Service can help: <a href="https://www.equalityadvisoryservice.com">equalityadvisoryservice.com</a>.</p>
""",
    "complaints": """
<p class="lede">If something has gone wrong, tell us and we will try to put it right.</p>

<h2>How to complain</h2>
<p>Write to <a href="mailto:complaints@lightmorphic.com">complaints@lightmorphic.com</a>. Please say what happened, when, and what you would like us to do about it. If it concerns something you can see on screen, a screenshot helps.</p>

<h2>What happens next</h2>
<p>We aim to acknowledge within two working days and to answer properly within ten. If it is going to take longer than that, we will tell you why and when to expect an answer.</p>

<h2>If we do not put it right</h2>
<p>Say so, and ask for it to be looked at again. A complaint that has been through that and is still unresolved can be taken further: to the Information Commissioner's Office at <a href="https://ico.org.uk">ico.org.uk</a> for anything about personal data, or to the Equality Advisory and Support Service at <a href="https://www.equalityadvisoryservice.com">equalityadvisoryservice.com</a> for accessibility.</p>

<h2>Faults rather than complaints</h2>
<p>A bug is usually quicker to raise in the open, where anyone can see it is being worked on: <a href="https://github.com/lightmorphic/sidebar/issues">github.com/lightmorphic/sidebar/issues</a>.</p>
""",
}


SOURCE_LINKS = [
    ("Repository", ""),
    ("Documentation", "#readme"),
    ("Security", "/security/policy"),
    ("Licence", "/blob/main/LICENSE"),
    ("Changelog", "/blob/main/CHANGELOG.md"),
    ("Issues", "/issues"),
    ("Releases", "/releases"),
]
REPO = "https://github.com/lightmorphic/sidebar"

GITHUB_MARK = (
    '<svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor" aria-hidden="true">'
    '<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49'
    '-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72'
    ' 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2'
    '-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44'
    ' 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01'
    ' 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>'
)
OSI_MARK = (
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" '
    'stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="6.4" r="3.1"/>'
    '<circle cx="6.4" cy="16.4" r="3.1"/><circle cx="17.6" cy="16.4" r="3.1"/>'
    '<path d="M10.4 9.1 8 13.7M13.6 9.1 16 13.7M9.5 16.4h5"/></svg>'
)


def source_footer() -> str:
    links = "\n".join(
        f'    <a href="{REPO}{path}">{label}</a>' for label, path in SOURCE_LINKS
    )
    return f"""<div class="legal source">
  <p class="marks">
    <a href="{REPO}" aria-label="Lightmorphic Sidebar on GitHub" title="On GitHub">{GITHUB_MARK}</a>
    <a href="https://opensource.org/licenses/GPL-3.0" aria-label="Open source, under the GNU GPL version 3" title="Open source, GPL v3">{OSI_MARK}</a>
  </p>
  <nav aria-label="Source code">
{links}
  </nav>
</div>"""


def sub_footer(current: str) -> str:
    links = "\n".join(
        f'    <a href="{slug}.html"{" aria-current=\"page\"" if slug == current else ""}>{label}</a>'
        for slug, label, _, _ in PAGES
    )
    return f"""<div class="legal">
  <p>&copy; Lightmorphic Ltd. Registered in England and Wales, company number
    <a href="https://find-and-update.company-information.service.gov.uk/company/{COMPANY_NO}">{COMPANY_NO}</a>.
    Registered office: {OFFICE}.
    Page last updated: <time datetime="{DATE_ISO}" id="updated">{DATE_HUMAN}</time>.</p>
  <nav aria-label="Legal">
{links}
  </nav>
</div>"""


TEMPLATE = """<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} &mdash; Lightmorphic Sidebar</title>
<meta name="description" content="{description}">
<meta name="theme-color" content="#101013">
<link rel="canonical" href="https://sidebar.lightmorphic.com/{slug}.html">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/images/lightmorphic-sidebar-mark-180.png">
<link rel="stylesheet" href="legal.css">
<script type="application/ld+json">
{{
  "@context": "https://schema.org",
  "@type": "WebPage",
  "name": "Lightmorphic Sidebar {title_lower}",
  "url": "https://sidebar.lightmorphic.com/{slug}.html",
  "inLanguage": "en-GB",
  "description": "{description}",
  "dateModified": "{date_iso}",
  "isPartOf": {{ "@type": "WebSite", "name": "Lightmorphic Sidebar", "url": "https://sidebar.lightmorphic.com/" }},
  "publisher": {{
    "@type": "Organization",
    "name": "Lightmorphic Ltd",
    "url": "https://lightmorphic.com",
    "address": {{
      "@type": "PostalAddress",
      "streetAddress": "82A James Carter Road",
      "addressLocality": "Mildenhall",
      "postalCode": "IP28 7DE",
      "addressCountry": "GB"
    }}
  }}
}}
</script>
</head>
<body>
<main>
<a href="index.html" class="back"><img class="mark" src="images/lightmorphic-sidebar-mark-112.png" alt="Lightmorphic Sidebar" width="56" height="56"></a>
<h1>{heading}</h1>
{body}
{footer}
</main>
</body>
</html>
"""


def main() -> None:
    for slug, label, heading, description in PAGES:
        html = TEMPLATE.format(
            slug=slug,
            title=label,
            title_lower=heading.lower(),
            heading=heading,
            description=description,
            date_iso=DATE_ISO,
            body=BODIES[slug].strip(),
            footer=source_footer() + "\n" + sub_footer(slug),
        )
        (SITE / f"{slug}.html").write_text(html)
        print("wrote", f"site/{slug}.html")


if __name__ == "__main__":
    main()
