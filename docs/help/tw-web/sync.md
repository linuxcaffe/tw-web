---
title: "Syncing"
category: "Sync & devices"
summary: "Keeping your tasks the same on every device with gittw: the Sync dialog, automatic sync, undo"
---
# Syncing

If you use Taskwarrior on more than one device, say a laptop and a phone, they need the same tasks.
tw-web syncs with [gittw](https://github.com/linuxcaffe/gittw), which keeps your `~/.task` folder in git and shares it through a git server you choose, such as Codeberg or GitHub.

Each device is a **station**, with its own name (`gittw.device`): the laptop might be `yoga` and the phone `s5`.
The menu's footer names the station you're on.

```
$ tw -I gittw
```

The gittw README covers setting up the shared repository and each station.
Once `~/.task` is a gittw repository, tw-web's Sync works with nothing more to set up.

## The Sync dialog

**Menu → Sync** opens it.

[image: the Sync dialog, showing 3 incoming changes from s5, 1 local change, and Sync Now]

It fetches as it opens, and then tells you:

- what's **coming in** from each other station: "Incoming: 3 changes from s5"
- what's **here** and not sent yet
- when each station last synced
- how automatic sync is getting on

Type a note if you like (it becomes the sync's commit message), and click **Sync Now**.
gittw commits what's changed here, pulls what's new from the others, and pushes the result.
Changes to the same task on two stations are merged by the task: the later change wins.

A sync can take a minute or two on a slow connection, or a phone.

## Automatic sync

With **Settings → General → Sync automatically** on (it is, when gittw is there), you hardly need the dialog.
tw-web syncs:

- soon after the server starts
- a minute after your last change
- every 15 minutes, or every 5 after a failed try, as when you're offline

When changes come in from another station, the view reloads by itself, with a note saying where they came from:

```
Synced: 2 changes from s5
```

A sync and a `task` command never run at the same time: each waits for the other, usually for a few seconds, so a change can't be lost between the two.

## Undo

The Sync dialog also has **Undo**, which runs `task undo`: it reverses the last change to any task, after asking.

## When a sync fails

The dialog says why, in gittw's own words, with **Retry**.
Every sync, manual or automatic, is also written to the server log (`tw-web.log`), so a message that flashed past can be read later: see [Troubleshooting](troubleshooting.md).

## See also

- [On a phone (Termux)](phone.md)
- [Settings](settings.md#general)
