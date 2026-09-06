# Reporting something

If you have found a way this extension could be used against the person who
installed it, please tell us before telling anyone else.

**Where:** <complaints@lightmorphic.com>, or GitHub's private reporting on
this repository (Security, then "Report a vulnerability").

Please say what you did, what happened, and what you expected. A rough
recipe is worth more than a long description.

**What happens next:** we aim to acknowledge within two working days and to
say what we intend to do within ten. If a fix goes out, the release notes
say what was wrong, and you are credited unless you would rather not be.

## What is in scope

The extension in `chrome/`, and the website in `site/`.

A website shown inside the panel is that website. We can ask it for its
phone layout; we are not responsible for what it does.

## Worth knowing before you report

These are deliberate, and documented in the panel's own Information tab:

- **The panel strips the headers that stop a site being framed.** That is
  the whole point of it, and it happens only for a site the user has
  granted access to, one site at a time.
- **A site opened in the panel is told it is on a phone.** In its request
  and inside the page. A tab the user opens themselves is never touched.
- **Copies of a site's cookies are written into a storage partition
  belonging to this extension**, so a site in the panel can see its own
  settings. The originals are never modified and keep their protection
  everywhere else in the browser.
- **What the user saves is stored in ordinary bookmarks**, deliberately
  visible and deletable. It is not a secret store, and the panel says so
  the first time it is opened.

## What the extension does not do

No account, no server of ours, no analytics, no remote code. It installs
with access to no websites at all.
