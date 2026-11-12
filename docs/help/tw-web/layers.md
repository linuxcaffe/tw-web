---
title: "Holidays, events, moon & seasons"
category: "Views"
summary: "What the Calendar and Agenda show besides tasks"
---
# Holidays, events, moon & seasons

These aren't tasks: they never move, open or count, and the nav bar's filter leaves them alone.
They come from [tw-events](https://github.com/linuxcaffe/tw-events), which writes them to your taskrc. Shown on the [Calendar](calendar.md) and the Agenda.

## Holidays

Amber all-day bars from your taskrc's `holiday.*` entries (tw-events writes them: `events init`).
The Agenda shows them on its date lines. Settings → Calendar → Holidays.

## My events

Your own events from tw-events (`~/.task/config/my-events.txt`) and the ghosts of tasks (`events add <id>`, which stay after the task is done): green bars, or a solid mark with 📌 at their time.
On the Agenda they get a line of their own. Settings → Calendar → My events.

## Moon & seasons

The moon's phases, solstices and equinoxes (`events init --moon yes --seasons yes`) are a dashed mark at their time in Week and Day (hover the icon; Day view shows the name beside it), just the icon by the day number in Month (hover for the name, click for that day), and follow the date on the Agenda's lines.
So are the clock changes, with 🕐 (`--clock yes`). Settings → Calendar → Moon & seasons.
