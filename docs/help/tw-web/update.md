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

The pill is greyed out when an update would get in the way of your own work; its tooltip says why, and so does a tap (a phone has no tooltips):

- **there are local changes outside docs/help/**: you've edited tw-web's own code
- **on branch …, not main**: you're running a version of your own

## Help edits made on a station

If the only files you've changed are help pages (under `docs/help/`), the pill stays yellow, and a tap offers to send them home first:

```
Send your help edits on this station to tw-web, then update (2 new)?
```

Say yes and the server commits your edits ("Help: edits from s5"), puts them on top of the new version, pushes them, and updates, all in one go.
If anything goes wrong (you're offline, the station can't push, or the new version changes the same lines), nothing is sent and your edits stay as they were.
The station needs push access to tw-web's repository: its git remote's push address (`remote.origin.pushurl`) and a key that's allowed there.

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
