# Security

If you have found a way this extension could be used against the person who
installed it, please tell me before telling anyone else.

## Supported versions

Only the latest release is supported. Fixes go into a new version, never into
an old one.

| Version | Supported |
|---|---|
| 1.1.x | Supported |
| Earlier than 1.1 | Not supported |

## How to report

**First choice:** use GitHub's private vulnerability reporting. Open the
[Security tab](https://github.com/gh-lm/sidebar/security) and choose **Report a
vulnerability**. Only I can see what you write.

**If that is not possible:** email <complaints@lightmorphic.com>.

Please say what you did, what happened, and what you expected. A rough recipe is
worth more than a long description.

## What to expect

This is a one-person project, so these are aims, not promises. I aim to
acknowledge a report within two working days and to say what I intend to do
within ten. If a fix goes out, the changelog says what was wrong, and you are
credited unless you would rather not be.

## What is in scope

The extension in `chrome/`, and the website in `site/`.

A website shown inside the panel is that website. The extension can ask it for
its phone layout; it is not responsible for what the site does.

## Worth knowing before you report

These are deliberate, and documented in the panel's own Information tab:

- **The panel strips the headers that stop a site being framed.** That is the
  whole point of it. It happens only for a site the user has granted access to,
  and the rule applies to the side panel itself, never to the user's tabs.
- **A site opened in the panel is told it is on a phone,** in its request and
  inside the page. A tab the user opens themselves is never touched.
- **Copies of a site's cookies are written into a storage partition belonging
  to this extension,** so a site in the panel can see its own settings. The
  originals are never modified and keep their protection everywhere else in the
  browser.
- **What the user saves is stored in ordinary bookmarks,** deliberately visible
  and deletable. It is not a secret store, and the panel says so the first time
  it is opened.

## What the extension does not do

No account, no server of ours, no analytics, no remote code. It installs with
access to no websites at all.
