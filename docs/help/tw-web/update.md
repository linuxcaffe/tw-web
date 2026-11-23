---
title: "Updating"
category: "Getting started"
summary: "The update pill under the menu logo, what an update does, and the page's saved files"
---
# Updating

tw-web keeps an eye out for its own updates, and tells you when there's one.

## The update pill

Open the menu (the logo at the left of the nav bar).
Under the logo is tw-web's version, like `2.0.0-14-gb7a28d0`, and when there's something new, a yellow pill:

```
Update (3 new)
```

[image: the side menu with the yellow Update pill under the logo]

Hover it for what's new, one line per change.
Click it, say yes, and tw-web updates itself: the server pulls the new version, restarts if it has to, and the page reloads onto it.
It takes a few seconds, and your tasks aren't touched.

The server looks for updates every hour, and also when you sync (see [Syncing](sync.md)), so the pill is never far behind.

## When it can't

The pill is greyed out, and its tooltip says why, when an update would get in the way of your own work:

- **there are local changes**: you've edited tw-web's files yourself
- **on branch …, not main**: you're running a version of your own

An update only ever moves forward along the published version (a git fast-forward), so it never overwrites anything.

With `tw`, `tw -u tw-web` does the same from a terminal.

## The page's saved files

To start fast, and to open even when the server isn't answering, the page keeps a copy of its own files in your browser.
When the server answers, the browser always asks it for the newest files first, so after an update you get the new page.

If a page ever looks half old and half new, start it with:

```
$ tw-web-launch.sh --clean
```

which clears those saved files and starts fresh.

## See also

- [Installing](install.md)
- [Troubleshooting](troubleshooting.md)
