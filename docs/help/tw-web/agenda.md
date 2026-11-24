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

Each task appears **once**, at the date that says when it's coming up, its *effective date*:

| The task has | It appears on |
|---|---|
| a scheduled date, a due date, or both | the earlier of the two |
| only a wait date | the wait date |
| only an until date | the until date |
| none of these | not on the Agenda |

A wait or until date beside a scheduled or due one is ignored here.

Suppose you add these:

```
$ task add Renew passport due:2026-12-15 scheduled:2026-12-01
$ task add Pay rent due:eom
$ task add Pick up the bike wait:2026-12-04
$ task add Call the dentist
```

The passport task sits under December 1st, when you plan to start; the rent under the last day of the month; the bike under December 4th, when it comes back into view; and the dentist call isn't on the Agenda at all, because it has no date.

A **waiting** task, hidden on the List until its wait date, shows here: the Agenda is for seeing what's coming, and a task coming back next week is part of that.
A card placed by its wait or until date says so, `wait Dec 4` or `⌛ until Dec 10`, since neither date shows on a card otherwise.

The heading counts them by kind, "4 Due, 7 Sched", adding Wait and Until when there are some.
The counter in the nav bar says how many dated tasks are shown out of all your tasks of those statuses, as on the [List](list.md): `11/40`.

Within a day they're in time order, so a task with only a date comes first.
Cards are the same as on the [List](list.md), with the same buttons and the same card/row switch.

## The date lines

Each day gets a quiet line: "Friday - Nov 27".
Today's reads "TODAY - …" and tomorrow's "TOMORROW - …", and a day that's already past with a due date still on it says **(overdue)** in red.
A past scheduled day is just a past day: you meant to start then, which isn't the same as being late.

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
- [Filtering](filter-bar.md)
