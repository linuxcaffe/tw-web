---
title: "Firefox extension"
category: "Sync & devices"
summary: "Add a task or bookmark a page from anywhere in Firefox, and start or stop the server"
---
# Firefox extension

tw-web comes with a small Firefox extension, for the moments when you're in the middle of something else and a task occurs to you.
Press **Alt+W** anywhere in Firefox, and a popup opens over the page.

[image: the extension's popup open over a web page, on the Add task tab]

## Add task

The popup opens here.
Type what needs doing, optionally a project, priority and tags, and press `Enter`: the task is added, and the popup closes.
It's `task add`, without leaving the page you're on, and your hooks run as usual.

## Bookmark

Saves the page you're looking at as a task tagged `+bkmk`, with its title as the description and its address in an annotation.
In tw-web the address is a link (see [Annotations and links](annotations.md)), so `task +bkmk list`, or `bkmk` in the tags input, is a reading list.
Add tags of your own in **Extra tags**.

## tw-web

Says whether the tw-web server is running, with your pending count and Taskwarrior's version, and lets you **Stop** it or start it again, without a terminal.

## Installing it

The extension is in tw-web's `firefox/` folder, and it isn't on Mozilla's add-ons site.
Starting and stopping the server needs a small helper Firefox can call, installed once:

```
$ mkdir -p ~/.mozilla/native-messaging-hosts
$ cp tw-web-native-host.json ~/.mozilla/native-messaging-hosts/tw_web_launcher.json
```

Then load the extension: open `about:debugging` in Firefox, **This Firefox → Load Temporary Add-on…**, and pick `firefox/manifest.json`.
Pin it to the toolbar from the Extensions (puzzle piece) menu if you like.

The README has the details: [Firefox Extension](https://github.com/linuxcaffe/tw-web#firefox-extension).

It talks only to `localhost:5000` on your own machine, and nothing else.
