# Submitting Lightmorphic Sidebar 1.0.1 to the Chrome Web Store

Everything on this page is ready to copy straight into the form at
<https://chrome.google.com/webstore/devconsole>. Nothing else needs writing.

Upload: `dist/lightmorphic-sidebar-1.0.1.zip`

1.0.0 is published and live, so that number can never be used again. This is
an update, not a first submission: the code has changed since, and the
version is now 1.0.1. Updates are usually reviewed faster than a first
submission, unless they ask for a permission the published version did not
have. This one does not.

---

## Rejected once, on 2 September 2026

Reference **Yellow Argon**, under spam and placement: "having excessive
keywords in the item's description", quoting this line:

> DuckDuckGo, Google, Google Images, Bing, Startpage, Mojeek and Qwant.

That was a run of seven brand names in a row, and it reads to the reviewer
as keyword stuffing whether it was meant that way or not. It is gone. The
description now says "seven search engines" and names none of them.

The same policy clause covers screenshots and promotional images, not just
the description, so the first screenshot was reshot as well: it had our own
website in the panel, whose small print lists five browsers by name. It now
shows an ordinary third-party page instead, which demonstrates the feature
better anyway.

**The rule to keep.** No list of brand names anywhere a reviewer reads or
looks: description, title, screenshots, tiles. Say what the thing does and
how many of something there are. The permission justifications are not
public listing text and can stay specific.

The corrected listing went on to be published as 1.0.0. Everything below now
describes the 1.0.1 update.

---

## 1. Store listing tab

**Name**

```
Lightmorphic Sidebar
```

**Short description** (this is the manifest description, already in the zip; the
form fills it in for you)

```
Pin any website to a side panel and read it beside the page you're on. Plus search, a scratchpad and snippets. Private by default.
```

**Detailed description**

```
Lightmorphic Sidebar puts a private side panel beside whatever you are reading.

Pin a site to the rail and it opens right here in the panel, like a small
window beside the page you are on: your mail, a chat, docs, anything you keep
flicking tabs to reach.

Keep a scratchpad one click away. Save the lines of text you retype every week
and click one to drop it straight into whatever box you were typing in. No
titles to fill in, no filing.

Search is in the panel too. One box, and a row of letters for the seven
search engines you can pick from, so changing where you search is one press
and not a trip to settings. Results open in the panel, in the site's phone
layout so they fit the width.

Everything you save lives in one bookmarks folder, so if your browser syncs
bookmarks it all follows you to your other machines. There is no account to
make and no server to sign in to. It works in browsers that sync bookmarks but
not extension data, which is why it was built this way.

It installs with access to no websites at all. When you open a pinned panel it
asks for that one site, and nothing else. Nothing is sent anywhere: no
accounts, no servers, no analytics, no remote code. Everything stays in your
browser.

Light, dark, or following the browser, on one button.

Lightmorphic Sidebar does not touch your new tab page or anything else in the
browser. It is a side panel and nothing more.

Works in Chrome and the browsers built on it, from version 114.
```

**Category.** The form asks for a group and then a category inside it. The
single "Productivity" of the old store was split up in 2023, so Productivity
on its own is no longer a complete answer.

These are the only choices, read off the live store rather than the
documentation, which is out of date:

| Group | Categories |
|---|---|
| Productivity | Workflow & Planning, Tools, Communication, Education, Developer Tools |
| Make Chrome Yours | Functionality & UI, Privacy & Security, Accessibility |
| Lifestyle | Household, Entertainment, Games, News & Weather, Shopping, Social Networking, Travel |

Group: **Make Chrome Yours**
Category: **Functionality & UI**

Google describes that one as extensions that enhance the Chrome user
interface, such as tab managers, shortcut managers and app launchers. That is
what this is: it adds a panel to the browser, and its whole pitch is
replacing the tab you keep going back to.

The alternative is **Productivity → Workflow & Planning**, where Lightmorphic
Paste sits. It fits the scratchpad and the snippets but not the panel, and
Productivity is the busier group to be found in. If you would rather have the
two extensions filed together, use that instead; nothing else on this page
changes.

**Language:** English (United Kingdom)

### Graphic assets

The section takes three kinds of image, and every file below already matches
its spec exactly.

**Screenshots** — up to a maximum of 5, 1280x800 or 640x400, JPEG or 24-bit
PNG with no alpha. At least one is required.

| Order | File |
|---|---|
| 1 | `store/01-panel.png` |
| 2 | `store/02-search.png` |
| 3 | `store/03-scratchpad.png` |
| 4 | `store/04-snippets.png` |
| 5 | `store/05-light.png` |

All five are 1280x800, 24-bit, no alpha. They are full bleed with square
corners and no border, which is what the store asks for.

**Small promo tile** — 440x280 canvas, JPEG or 24-bit PNG with no alpha.

    store/promo-tile-440x280.png

**Marquee promo tile** — 1400x560 canvas, JPEG or 24-bit PNG with no alpha.

    store/promo-marquee-1400x560.png

The marquee is only used if the extension is picked for a featured
placement. It costs nothing to supply, so upload it.

**No alpha channel on any of these seven.** The store refuses a PNG with
transparency here and does not say why. `tools/store-shots/build.sh` reads
the PNG header of every file after drawing it and fails the build if the
colour type is not 2.

**The icon is not in this section.** It comes from the zip, from the `icons`
block in the manifest. It is 128x128, full bleed, with the rounded corners
transparent rather than filled — the opposite rule to the tiles, where an
alpha channel is refused.

Google's written advice is 96x96 of artwork inside 16 pixels of transparent
padding, which suits a mark that needs breathing room. Ours already is an
app-icon shape with its own margin drawn in, so padding it again left a wide
empty border and made it look small beside every other listing. Full bleed is
the right call here. `./make-icons.sh` builds it, and
`store/store-icon-128.png` is a standalone copy in case a field for it turns
up elsewhere on the form.

**Website**

```
https://sidebar.lightmorphic.com/
```

**Support URL**

```
https://github.com/lightmorphic/sidebar/issues
```

Issues are enabled on the repository and the page is public, so anyone
reaching it from the listing can read what has been reported and open
something themselves without being asked for anything first.

**Support email**

```
sidebar@lightmorphic.com
```

---

## 2. Privacy tab

**Single purpose** — paste into "Single purpose description":

```
Lightmorphic Sidebar gives you one side panel that holds the things you keep
reaching for while browsing: pinned websites that open beside the page you are
on, a search box, a scratchpad, and saved snippets of text.
```

**Permission justifications** — one box each, paste as written:

`sidePanel`
```
The extension is a side panel. This is the API that opens it.
```

`storage`
```
Keeps a local copy of the same data that is saved in bookmarks, so the panel
can draw instantly and still works if the bookmarks API is unavailable.
```

`clipboardWrite`
```
Copies a saved snippet to the clipboard when the user clicks it.
```

`tabs`
```
"Pin this page" reads the address of the tab the user is on, to fill it into
the dialog, and the "open in the main window" button opens the panel's page in
a tab. Only the URL is read, never page content.
```

`scripting`
```
Two things, both only on a site the user has already allowed. First, putting a
saved snippet into the box the user was typing in when they click it. Second,
telling a page opened inside the panel that it is on a phone, so the site
serves its phone layout instead of a desktop one that cannot fit in a panel.
The second script runs only inside the panel; a tab the user opens themselves
is untouched.
```

`bookmarks`
```
Everything the user saves - pinned sites, scratchpad, snippets - is kept in one
bookmarks folder, so the browser's own bookmark sync carries it between their
machines. There is no account and no server. Pinned sites are stored as
ordinary bookmarks, so they stay useful even without the extension.
```

`declarativeNetRequestWithHostAccess`
```
Two things, for one site at a time and only after the user has granted
permission for that site: removing the headers that stop a site being displayed
inside a panel, and requesting that site's phone layout, because the panel is
about as wide as a phone.
```

`favicon`
```
Draws the site icon on each pinned button, from the browser's own cache. It
makes no network request.
```

Host permissions (`*://*/*`, optional)
```
Never requested at install; the extension starts with access to no websites at
all. It is asked one site at a time, from the user's click, when they open that
site in the panel, and covers that site's own domain and its subdomains,
because a site that answers on www is otherwise refused. The search engines are
asked for together on the first search rather than as separate prompts. The
Information tab also offers a single "allow every site" for anyone who would
rather not be asked again; it is off by default and revocable from the same
button.
```

**Remote code:** No, I am not using remote code. There is no `fetch`, no
`eval`, no CDN and no remote script tag anywhere in the package.

**Test instructions** (limit 500 characters; there is no login, so leave the
username and password boxes empty)

```
No account or login is needed.

1. Open the panel from the toolbar icon, or Ctrl+Shift+S.
2. Search is shown first. Type a word, press a lettered circle. Results
   open inside the panel.
3. Press the notepad icon, type anything, close and reopen the panel. The
   text is still there.
4. In your bookmark manager, Other Bookmarks now holds a folder called
   "Lightmorphic Sidebar" containing what you typed. That folder is the
   whole of the storage. Nothing is sent anywhere.
```

**Data usage** — tick nothing. Do not tick any of the data categories: the
extension collects and transmits none of them. Then tick all three
certifications:

- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL**

```
https://sidebar.lightmorphic.com/privacy.html
```

---

## 3. Distribution tab

- Visibility: Public
- Regions: all
- Pricing: Free
- **Trader status: Non-trader.** Free, no payments taken, not a business
  offering. (Publisher details are on file as Lightmorphic Ltd, company number
  17423646, 82A James Carter Road, Mildenhall, Suffolk IP28 7DE.)

---

## Putting up an update

Same form, same place, and everything on the listing tabs stays as it is.

1. Bump the version in `chrome/manifest.json` and run `./package.sh`.
2. Open the developer console and click the extension.
3. **Package** in the left menu, then **Upload new package** at the top right.
4. Choose the new zip from `dist/`. There is no version box to fill in: the
   store reads it from `manifest.json` inside the zip. The file name plays
   no part, and `package.sh` names the file to match only so the right one
   is easy to pick.
5. **Submit for review**, and let it publish automatically once approved.

The version has to be higher than the published one every time; a number
that has been published can never be used again. An update that asks for no
new permission is usually reviewed faster than a first submission. One that
adds a permission goes back into the slow queue.

---

## What changed in 1.0.1

Worth having to hand if the review asks, and worth putting in the "what's
new" box if the form offers one:

Pinned sites that answered on a different address than the one typed came
back as "refused to connect". bbc.com serves www.bbc.com, and permission for
the first did not cover the second, so the header that blocks framing
survived. Permission now covers a site's subdomains as well.

Separately, the rule that strips that header was tied to the pinned site's
own domain even for someone who had allowed every site, so a site that
redirects to a different domain entirely was never covered. Allowing every
site now installs one rule that applies everywhere.

No new permissions. Nothing else changed.

---

## 4. Before you press Submit

- [ ] Developer account fee of $5 paid
- [ ] Publisher email verified in the account settings
- [ ] `dist/lightmorphic-sidebar-1.0.1.zip` uploaded (68 KB, 18 files)
- [ ] Detailed description pasted
- [ ] Website and support URL both filled in, and they are different
- [ ] Five screenshots, small promo tile and marquee all uploaded
- [ ] Every permission justification pasted
- [ ] Privacy policy URL pasted and the three certifications ticked
- [ ] Group Make Chrome Yours, category Functionality & UI, non-trader

Review usually takes a few days. A first submission that asks for host
permissions is sometimes queued longer.

## After it is published

- Add the store link to `site/index.html` where it currently points at the
  store search
- Submit `https://sidebar.lightmorphic.com/sitemap.xml` to Google Search
  Console and Bing Webmaster Tools
