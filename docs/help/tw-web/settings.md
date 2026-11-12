---
title: "Settings"
category: "Getting started"
summary: "Menu → Settings, where it's all kept, and tw-web.rc"
---
# Settings

Most of what you can change about tw-web lives in one place: open the menu (the logo at the left of the nav bar) and choose **Settings**.
The panel slides out over the page, divided into sections; click a section's heading to unfold it, and again to fold it away. tw-web remembers which ones you left open.

[image: the Settings panel open over the List, with the General and Calendar sections unfolded]

There's no Save button.
Each change is saved the moment you make it, and a small "Saved" appears beside its section to say so.
Change your mind? Just change it back.

## Where your settings are kept

Settings are stored by the tw-web server, in `settings.json` in its folder, not in your browser.
That means every browser that talks to the same server sees the same settings.
If you set the Kanban columns on your laptop, then open tw-web on your phone through the same server, the columns are already there.

The one exception is the page theme, which belongs to the browser you're using, so your phone can be dark while your laptop stays light.

## Appearance

**Page theme** switches between light and dark.
Try it: the whole page changes at once, and the button now offers to switch back.

## General

**Notification timeout** is how long the little messages that confirm what just happened stay on screen, in milliseconds.
The default is 3000, three seconds.
Set it to 0 and they stay until you dismiss them, which is handy while you're learning what tw-web is doing behind the scenes.

**Kanban columns** are the columns of the Kanban board, left to right, as a comma-separated list:

```
backlog, todo, doing, review, done
```

Each column is a value of the `state` UDA (see [tw-web.rc](#tw-web-rc) below), so moving a card to "doing" runs, in effect:

```
$ task 12 modify state:doing
```

Rename them, reorder them, add a column or drop one; the board follows.

**Sync automatically** works with [gittw](https://github.com/linuxcaffe/gittw), which keeps your task data in git and shares it between stations.
With it on, tw-web syncs soon after the server starts, a minute after your last change, and every 15 minutes (every 5 after a failed try, as when you're offline).
Changes made on another station show up by themselves. See *Syncing*.

## Calendar

**Day start / end** set the hours the Week and Day views show, 06:00 to 23:00 by default.
A task scheduled outside them is still there; scroll to it.

**Default view** is the view the Calendar opens in: Week, Day or Month.

**Week zoom steps** and **Day zoom steps** give each view three zoom levels.
A step is a row size (5 to 60 minutes) and an hour to start at; the radio button marks the step the view opens at.
Press `W` on the Week view, or click its button again, and it moves to the next step:

[image: the Week view at its three zoom steps, side by side]

More about zooming, and pinching on a phone: [Calendar](calendar.md).

**Daylight** shades the hours between sunrise and sunset in the time column, with a softer edge for twilight.
It needs to know where you are, as a latitude and longitude (north and east are positive).
The default is Toronto:

```
43.65  -79.38
```

**Holidays**, **My events** and **Moon & seasons** turn on or off each of the things the Calendar and Agenda show that aren't tasks.
They come from [tw-events](https://github.com/linuxcaffe/tw-events); what each one looks like is on [Holidays, events, moon & seasons](layers.md).
Holidays also has a number: how many days ahead the Agenda gives a holiday its own line when no task falls on it (30 by default).

## Terminal

tw-web has a real terminal, the console, for the commands that need one (see *The command bar*).

**Default height** is how tall it opens, in pixels.

**Starting directory** is where its shell starts; leave it blank for the folder the tw-web server runs in.

**Init script** is a few commands run every time a shell opens, one per line:

```
echo hello
timer status
```

## Server

This section says how long the tw-web server has been running, and gives you two buttons.

**Restart server** starts a fresh server with the current code; the page reconnects by itself after a moment.

**Stop server** stops it, and it stays stopped until you start it again (`tw-web-launch.sh`, or the Firefox extension).
Until then the page shows a banner saying the server isn't answering.

## Annotation launchers

An annotation like this one:

```
$ task 12 annotate -- nb: tw:docs/tw-web-help-plan.md
```

shows on the task's card as a link, because `nb` is a launcher.
A launcher is a label and a command, and `{value}` in the command is replaced by whatever follows the label in the annotation.
These two come with tw-web:

| Label | Command |
|---|---|
| `file` | `xdg-open {value}` |
| `nb` | `http://localhost:5001/#{value}` |

A command that's a web address opens in the browser; anything else runs on the server's machine.
Add your own with **+ Add launcher**, say `man` with `xterm -e man {value}`, and then `man: task` in any annotation opens the man page.

[image: a task card with an nb: annotation shown as a link]

More: *Annotations and links*, and *Working with nb*.

## tw-web.rc

The Settings panel covers tw-web itself.
What tw-web needs from Taskwarrior goes in a small taskrc file of its own, `~/.task/config/tw-web.rc`, which your `.taskrc` includes (through `~/.task/config/included.rc`, the [awesome-taskwarrior](https://github.com/linuxcaffe/awesome-taskwarrior) way):

```
include ~/.task/config/tw-web.rc
```

Here's what's in it, and why.

```
uda.state.type=string
uda.state.label=State
uda.state.indicator=K
urgency.uda.state.backlog.coefficient=-5
urgency.uda.state.todo.coefficient=5
```

The `state` [UDA](../taskwarrior/udas.md) is what the Kanban columns are made of.
The two [urgency](../taskwarrior/urgency.md) coefficients push backlog tasks down and to-do tasks up in reports that sort by urgency, the CLI's `next` among them.

```
uda.due_duration.type=duration
uda.sched_duration.type=duration
```

How long a task lasts from its due or scheduled time, so the Calendar can draw it as a block rather than a moment.
They're [durations](../taskwarrior/durations.md): `due_duration:1h`, `sched_duration:30min`.

```
recurrence=no
recurrence.field=r
```

tw-web leaves recurrence to the [recurrence-overhaul hook](https://github.com/linuxcaffe/tw-recurrence_overhaul-hook), so Taskwarrior's own [recurrence](../taskwarrior/recurrence.md) is switched off, and tw-web looks for the hook's `r` attribute (`r:1mo`) instead of `recur`.
See *Recurrence*.

Priority is the one setting tw-web needs that isn't in this file, because it changes a built-in attribute.
Numeric priorities as well as H, M and L:

```
uda.priority.values=1,2,3,4,5,6,H,M,L
```

See [Priority](../taskwarrior/priority.md) for how 2.6.2 treats priority as a UDA.
