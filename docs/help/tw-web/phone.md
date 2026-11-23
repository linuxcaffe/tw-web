---
title: "On a phone (Termux)"
category: "Sync & devices"
summary: "tw-web on Android: Termux, tw-mobilize, the app on the home screen, when Android stops the server"
---
# On a phone (Termux)

There are two ways to use tw-web on a phone.

**Through your computer.**
With [Tailscale](https://tailscale.com) on both, open your computer's tw-web from the phone's browser (`http://yoga:5000`).
Nothing to install on the phone beyond Tailscale, but the computer has to be on.

**On the phone itself.**
tw-web, Taskwarrior and your tasks all live on the phone, inside [Termux](https://termux.dev), and sync with your computer through [gittw](https://github.com/linuxcaffe/gittw).
It works offline, on the bus, anywhere.
The rest of this page is about this way.

[image: tw-web's List on a phone, installed on the home screen]

## Setting it up

[tw-mobilize](https://github.com/linuxcaffe/tw-mobilize) does it all.
Install Termux from F-Droid, then follow tw-mobilize's quick start; its `mobilize init`:

- installs Taskwarrior 2.6.2 (Termux's own package is 3.x, which tw-web doesn't support)
- clones your gittw task repository, so the phone has your tasks
- installs tw-web, with a home-screen button to start it
- checks the result

and `mobilize android` then walks you through the phone's own settings, opening each screen for you.

The README has the steps by hand: [Android / Termux](https://github.com/linuxcaffe/tw-web#android--termux).

## On the home screen

Open `http://localhost:5000` in the phone's browser, then **Add to Home Screen** (Chrome) or **Install** (Firefox).
tw-web gets its own icon and opens full screen, like any other app.

The layout is made for a narrow screen: the sidebars move into the menu, the bars wrap, and on the [Calendar](calendar.md) you hold a task to move it, swipe to change week and pinch to zoom.

## When Android stops the server

Android stops apps in the background when it wants the memory, and the tw-web server with them.
tw-mobilize's button starts it in a loop that restarts it, and it starts again whenever you open Termux, but now and then it's gone.

The page notices within half a minute, and says so:

```
tw-web server isn't answering (last reached 13:42).
Android may have stopped it. Open Termux to start it again.
[Open Termux]  [Retry]
```

Tap **Open Termux**, come back, and the page reloads by itself when the server answers.

`mobilize android` covers the settings that make this rarer: battery optimisation, a maker's own app-launch controls, and the like.

## Syncing with your computer

Automatic sync works on the phone as on the laptop: changes go out a minute after you make them, and come in every 15 minutes.
See [Syncing](sync.md).
Install and update the fleet's apps (`tw -u`) on one station, your computer, and let the phone get them by syncing: doing it on both makes their records clash.

## Files and links

On the phone, `file:` annotations and other file links open with Android's own apps (`termux-open`), and an `nb:` link opens your note even when nb-web isn't running.
See [Annotations and links](annotations.md).
