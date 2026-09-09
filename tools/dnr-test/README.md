# Header-rule probes

The panel strips the headers that stop a site being framed, and asks for the
phone layout, by installing a `declarativeNetRequest` session rule. A session
rule is browser-wide, so the condition on it is the only thing keeping it away
from ordinary browsing — and getting that wrong is invisible until somebody
cannot log in somewhere.

These run the real extension in a real Chrome.

    cd tools/store-shots/work/node        # where puppeteer is installed
    cp ../../../dnr-test/*.js .
    DISPLAY=:0 node panelprobe.js <repo> <fresh profile dir>   # needs a screen
    node probe.js <repo> <fresh profile dir>                   # headless

`probe.js` asks what an ordinary tab sees: the page's user-agent and the
user-agent on a fetch from it must match, and the mobile hint must be off.

`panelprobe.js` opens the real side panel — through a real mouse click, the
only thing `sidePanel.open()` accepts — and checks that a page which sends
`X-Frame-Options: DENY` still appears in it, and that the same site's cookies
in an ordinary tab are unchanged afterwards.

`stripprobe.js` answers the question the fault was reported as: with the strip
drawn on a page and the panel closed, it walks a whole login -- a request that
sets a session cookie, a redirect, and a page that only renders when the
cookie comes back -- and compares every header the server saw against the same
walk in a browser with no extension loaded at all. Run it against a checkout
from before the fix and the user-agent count comes back as two.

Delete the profile directory between runs; the permission is granted by
writing it into the profile, as headless Chrome cannot show the prompt.
