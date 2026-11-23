---
title: "Installing"
category: "Getting started"
summary: "Installing on Linux, starting it with tw-web-launch.sh, the app window, reaching it from other devices"
---
# Installing

tw-web needs three things: Linux (or Android with Termux), Python 3, and [Taskwarrior 2.6.2](../taskwarrior/introduction.md).
It doesn't work with Taskwarrior 3.

## The easy way

With [awesome-taskwarrior](https://github.com/linuxcaffe/awesome-taskwarrior)'s `tw`, it's one line:

```
$ tw -I tw-web
```

That clones tw-web into `~/.local/share/tw-web`, installs the few Python packages it needs, and adds **tw-web** to your desktop's app menu.
No Taskwarrior 2.6.2 yet?

```
$ tw -I taskwarrior
```

builds it into `~/.local`, no root needed.

## By hand

```
$ git clone https://github.com/linuxcaffe/tw-web.git
$ cd tw-web
$ pip install -r requirements.txt
$ ./tw-web-launch.sh
```

The packages are Flask and three small helpers; that's all.

## Starting it

`tw-web-launch.sh` does everything a day's start needs:

1. takes a snapshot of `~/.task` with [taskutil](https://github.com/linuxcaffe/tw-taskutil), when you have it, so there's always a way back
2. starts the tw-web server, unless it's already running
3. opens tw-web in its own window

[image: tw-web open in its own app window, with no browser toolbar]

It also takes:

```
$ tw-web-launch.sh --clean     # clear the page's saved files first, then start
$ tw-web-launch.sh --stop      # stop the server
```

`--clean` is the cure for a page that looks half old, half new after an update (see [Troubleshooting](troubleshooting.md)).

Or start the server alone, and open `http://localhost:5000` in any browser:

```
$ python3 app.py
```

## Its own window

tw-web is a web app you can install, so it gets its own window and icon, without the browser's toolbars.
On GNOME, Epiphany (GNOME Web) does this best, and the launcher opens it there when it finds it.
In Chrome or Chromium, use **Install** in the address bar; elsewhere, the browser's "Install this site as an app".

## Reaching it from other devices

tw-web has no login, and its console is a real shell on your machine.
So, by default, it only answers your own machine, at `127.0.0.1`.

To use it from your phone or another computer, use [Tailscale](https://tailscale.com), a private network between your own devices.
The launcher turns this on: tw-web then also answers on this machine's Tailscale address and name, say `http://yoga:5000`, and only your own devices can reach that.

Other settings (a different port, a reverse proxy) are in the README: [Network access](https://github.com/linuxcaffe/tw-web#network-access).

## On a phone

tw-web runs on an Android phone too, inside Termux, with your tasks synced from your computer.
See [On a phone (Termux)](phone.md).

## Next

- [Settings](settings.md), and the `tw-web.rc` file Taskwarrior needs for the Kanban and Calendar
- [What tw-web is](introduction.md)
