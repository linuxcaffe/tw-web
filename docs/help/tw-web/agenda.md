---
title: "Agenda"
category: "Views"
summary: "Scheduled and due tasks day by day, with holidays and events on the date lines"
---
# Agenda

The Agenda answers "what's coming up?": your dated tasks in order, under a line for each day.
Press `A` to get here.

[image: the Agenda with an overdue day, TODAY, TOMORROW and a holiday on its date line]

## What it shows

Every task with a **scheduled** date appears on that date, and every task with a **due** date and no scheduled date appears on its due date.
So a task appears once, at the date you plan to work on it if you've said, otherwise at its deadline.

Suppose you add these:

```
$ task add Renew passport due:2026-12-15 scheduled:2026-12-01
$ task add Pay rent due:eom
$ task add Call the dentist
```

The passport task sits under December 1st, the rent under the last day of the month, and the dentist call isn't on the Agenda at all, because it has no date.
The heading counts both kinds: "4 Due, 7 Sched".

Within a day they're in time order, so a task with only a date comes first.
Cards are the same as on the [List](list.md), with the same buttons and the same card/row switch.

## The date lines

Each day gets a quiet line: "Friday - Nov 27".
Today's reads "TODAY - …" and tomorrow's "TOMORROW - …", and a day that's already past, with tasks still on it, says **(overdue)** in red.

There's always a TODAY line, even when nothing is due or scheduled today: it says so, so you know where today is in the list.

Click any date line to open that day in the Calendar's Day view.

## Holidays and events

Holidays, your own events and the sky come from [tw-events](https://github.com/linuxcaffe/tw-events), and the Agenda puts them on the date lines:

```
Thursday - Dec 25 · Christmas Day
Friday - Dec 4 · 🌕 Full Moon 23:14
```

A holiday, or one of your own events, gets a date line of its own even when no task falls on that day, up to 30 days ahead (**Settings → Calendar → Holidays** sets how far).
The moon's phases, the seasons and the clock changes only follow the date of a line that's already there.
None of them are tasks: they can't be opened or moved, and the filter leaves them alone.
More: [Holidays, events, moon & seasons](layers.md).

## Statuses, context and filter

The Agenda follows everything in the nav bar: the status buttons, the context and the filter, by the same rules as the List.
Pick **Completed** or **Deleted** and it turns into a history: the days run backwards, newest first, and nothing is overdue any more.

## See also

- [Calendar](calendar.md), for the same tasks on a grid you can drag them around
- [Using dates](../taskwarrior/using_dates.md), for what due, scheduled and wait mean
- *Filtering*
