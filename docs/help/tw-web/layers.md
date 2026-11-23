---
title: "Holidays, events, moon & seasons"
category: "Views"
summary: "What the Calendar and Agenda show besides tasks, and where it comes from"
---
# Holidays, events, moon & seasons

A calendar feels emptier than it should without the things that aren't tasks: a holiday that closes the bank, your sister's birthday, the night of the full moon, the morning the clocks go back.
tw-web shows them on the [Calendar](calendar.md) and the [Agenda](agenda.md), as quiet layers under your tasks.

[image: a Week view with a holiday bar, a green event of your own and a dashed full-moon mark]

They aren't tasks.
They never move, open or count, and the nav bar's filter leaves them alone.

## Where they come from

All of them come from [tw-events](https://github.com/linuxcaffe/tw-events), which writes them into your taskrc as `holiday.*` entries, the same ones `task calendar` reads:

```
$ tw -I events
$ events init --locale en-CA --regions ON --moon yes --seasons yes --clock yes
```

tw-web reads them from Taskwarrior and never fetches anything itself.
Each kind has its own switch in **Settings → Calendar**.

## Holidays

Public holidays for your country and region, from holidata.net, are amber all-day bars on the Calendar.
On the Agenda, a holiday's name follows the date on its line, and gets a line of its own when no task falls that day, up to 30 days ahead (**Settings → Calendar → Holidays** sets how far).

## My events

Your own events live in a plain file, `~/.task/config/my-events.txt`, one per line:

```
2026-12-03 14:30  Dentist
--04-12           Anne's birthday
```

A date and a time is one moment; `--MM-DD` comes back every year.
An all-day event is a green bar, and a timed one is a solid green mark at its time in Week and Day, with 📌 (and a 📌 by the day number in Month).
On the Agenda each one gets a line.

You can also keep a **ghost** of a task: `events add 12` copies task 12 into your events, where it stays after the task is done or deleted, handy for the dates you want to remember once the work is over.

tw-web never edits these: change the file, then run `events refresh`.
Switch: **Settings → Calendar → My events**.

## Moon & seasons

The moon's four phases, the solstices and the equinoxes are moments, so in Week and Day each is a dashed mark across its day at its time, with its icon at the right:

```
🌕 Full Moon 23:14      ⚖️ March Equinox 03:01
```

Hover the icon for the name and time; Day view has room to write them beside it.
In Month there's just the icon, left of the day number: hover for the name, click for that day.
On the Agenda they follow the date of a line that's already there, and never make one of their own.

The clock changes are drawn the same way with 🕐: "Clocks back (EST)", from your machine's own time zone.
Switch: **Settings → Calendar → Moon & seasons** (with a separate box for the clock changes).

## See also

- [Calendar](calendar.md) and [Agenda](agenda.md)
- [Settings](settings.md#calendar)
- `task calendar`, which shows the same holidays in a terminal (`calendar.holidays=full`)
