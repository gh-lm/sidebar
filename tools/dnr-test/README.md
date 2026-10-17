# Does this extension leave other websites alone?

To show a website inside the panel, the extension has to take off the headers
that stop a site being framed, and ask for the phone layout. It does that with
a `declarativeNetRequest` session rule, and **a session rule applies to the
whole browser**. The condition on the rule is the only thing keeping it away
from ordinary browsing.

That went wrong once, in 1.1.0 and before. The rule had no condition tying it
to the panel, so once a site had been opened in the panel every tab in the
browser was affected: pages loaded as desktop Chrome while everything they
fetched went out as an Android phone, which made sites that tie a session to
one browser throw the user back to the login screen; and any website could
frame any other website that forbids framing, because the header saying so was
being stripped browser-wide.

Nothing about that was visible from inside the extension. These tests exist so
it cannot happen again unnoticed.

## Running them

    tools/dnr-test/run.sh

Needs a screen — `chrome.sidePanel.open()` only answers to a real mouse click,
so these drive a visible Chrome. On first run it downloads puppeteer and a
Chrome for testing into `tools/store-shots/work`, which is not committed.

To prove the tests still catch the fault, run them against a checkout from
before the fix:

    git worktree add /tmp/old <commit-before-the-fix>
    tools/dnr-test/run.sh /tmp/old

## What each one does

**hygiene.js** — the wide one. Measures an ordinary page in four states: with
no extension at all, with the extension idle, with a site open in the panel,
and with that site folded away to the strip. Compares the user-agent and
client hints the server was given for the page itself and for a stylesheet, a
script, an image, a font, an iframe and a fetch; the cookies, their SameSite
and HttpOnly flags; the page's `navigator`, its globals, its storage, its
computed colours and scrollbar; and whether a content security policy is still
enforced and a page saying `X-Frame-Options: DENY` still refuses to be framed.
Anything that differs from the clean browser is a failure, except the strip's
own element in the state where the strip is meant to be there.

**stripprobe.js** — walks a whole login with the strip drawn on the page: a
request that sets a session cookie, a redirect, and a page that only renders
when the cookie comes back. This is the shape of the fault as it was reported
— two-factor accepted, then straight back to the login screen.

**panelprobe.js** — the other side of it: the rule must still work where it is
wanted. Opens the real side panel and checks a page that sends
`X-Frame-Options: DENY` appears in it, and that the same site's cookies in an
ordinary tab are untouched afterwards.

## If you change the rule

`allowFramingFor` in `chrome/sidebar/sidebar.js` builds it. The condition
`tabIds: [chrome.tabs.TAB_ID_NONE]` is what confines it to the panel, because
a side panel is not a tab. Take that off and every one of these fails.
