# Contributing

Thank you for taking an interest in Lightmorphic Sidebar. It is a small project
run by one person, and every bit of attention is appreciated.

## The most useful thing you can send

An issue, written the way you would tell a friend what happened. It is quicker
for me to act on than a finished fix, because I can see the problem as you saw
it. Please say:

- what you did,
- what you expected,
- what happened instead,
- the version (it is on the Information tab of the panel) and your browser,
- and the site you had open in the panel, if it was a site that went wrong.

[Open an issue](https://github.com/gh-lm/sidebar/issues)

## Code

Pull requests are welcome too. If you are thinking of a big change, an issue
first saves us both time, because the extension is deliberately small. It asks
for as few permissions as it can, and every permission needs a written
justification at the Chrome Web Store, so a change that adds one is a bigger
conversation than the code suggests.

Before sending code, run the checks that keep ordinary websites untouched:

```bash
tools/dnr-test/run.sh
```

It needs a screen, because the side panel can only be opened by a real click.
`tools/dnr-test/README.md` explains what each check does.

## Security problems

Please do not post these in the open. Use GitHub's private reporting on the
Security tab, or follow [SECURITY.md](SECURITY.md).

## Forking

You are free to take the code and make it your own. It is released under the
GNU General Public License, version 3, so the same licence follows your changes.
