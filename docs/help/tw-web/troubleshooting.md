---
title: "Troubleshooting"
category: "Integrating"
summary: "The server isn't answering, port 5000 is busy, a page looks stale, where the log is"
---
# Troubleshooting

Most trouble with tw-web is one of a few things, and each has a quick way out.
Before trying anything risky with your tasks, take a snapshot, so there's a way back:

```
$ taskutil snapshot -m "before fixing things"
```

## "tw-web server isn't answering"

A banner at the top of the page says the server stopped answering, and when it last did:

```
tw-web server isn't answering (last reached 13:42).
It may have stopped: start it again (tw-web-launch.sh).
```

Start it again with `tw-web-launch.sh` (or the Firefox extension), and the page notices by itself within half a minute and reloads; **Retry** checks at once.
On a phone, **Open Termux** starts it: see [On a phone (Termux)](phone.md).

If it was stopped on purpose (**Stop** in the menu, or **Settings → Server → Stop server**), it stays stopped until you start it.

## Port 5000 is already in use

The server can't start because something else has the port, usually a tw-web that didn't quite stop.
`tw-web-launch.sh` stops an old tw-web of its own before starting.
If something else holds the port, find it and stop it:

```
$ fuser -v 5000/tcp
$ fuser -k 5000/tcp
```

Or give tw-web another port: `TW_WEB_PORT=5050 python3 app.py`.

## A page looks half old, half new

After an update, a page can mix old and new files, if the browser held on to some.
Start with:

```
$ tw-web-launch.sh --clean
```

which clears the page's saved files and starts fresh.
If only one view is odd, a plain reload (`Ctrl+R`, or `Ctrl+Shift+R`) is worth a try first.

In Epiphany, also check the zoom: it keeps a zoom level per address, and an unusual one can make the bars draw in odd places.

## A change didn't happen, or a hook complained

Every change goes through `task`, with your hooks.
If a hook refuses, its own message shows after the change, and the task stays as it was.
If a hook needs to ask you something, the console opens for it: see [The terminal console](console.md).
To see what happened from the command line:

```
$ task 12 info
```

and `task undo` (or **Undo** in the Sync dialog) reverses the last change.

## Tasks look different in a terminal

tw-web keeps its own context, separate from `task context`: check the context buttons.
And tw-web's filter only applies in tw-web.
See [Filtering](filter-bar.md#context).

## The log

The server writes a log, with every sync, manual or automatic, and anything that went wrong:

```
$XDG_RUNTIME_DIR/tw-web/tw-web.log      usually /run/user/1000/tw-web/
~/.cache/tw-web/tw-web.log              where XDG_RUNTIME_DIR isn't set
~/.cache/tw-web/server.out              on a phone started by tw-mobilize
```

To read the last sync's story:

```
$ grep -A12 'sync (' tw-web.log | tail -20
```

## Checking the server from outside

[taskutil](https://github.com/linuxcaffe/tw-taskutil) can check that a running tw-web is set up safely:

```
$ taskutil web probe --port 5000
```

## Still stuck?

The README covers the network settings and the phone setup in full: [tw-web on GitHub](https://github.com/linuxcaffe/tw-web#readme).
For Taskwarrior itself, see [Getting Help](../taskwarrior/help.md) and `task diagnostics`.
