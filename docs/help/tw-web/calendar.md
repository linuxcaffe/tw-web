---
title: "Calendar"
category: "Views"
summary: "Month, Week and Day; dragging tasks onto times; zoom steps; the Unscheduled column; phone gestures"
---
# Calendar

The Calendar puts your dated tasks on a grid of days and hours, so you can see a week at a glance and plan it by dragging tasks around.
Press `C` to get here.

[image: the Week view with blue scheduled blocks, a red due flag, the Unscheduled column at the right and the daylight stripe in the time column]

## Month, Week and Day

The buttons above the grid switch between **Day**, **Week** and **Month**, with ◀ and ▶ either side to step back and forward, and **Today** to come home.
The keys do the same: `D`, `W`, `M`, `T`, and `←` `→` (see [Keyboard shortcuts](../keys.md#calendar)).
Which view it opens in is up to you: **Settings → Calendar → Default view**.

In Month, click a day to open it in Day view.

## What's on the grid

Each task appears once, at its *effective date*, the same rule as the [Agenda](agenda.md#what-it-shows): the earlier of its scheduled and due dates, otherwise its wait date, otherwise its until date.
The block's colour says which date put it there:

| Block | The date |
|---|---|
| blue | scheduled: when you plan to work on it |
| red, ⚑ | due: its deadline |
| lavender | wait: when it comes back into view (it's hidden on the List until then) |
| brown, ⌛ | until: when Taskwarrior deletes it if it isn't done |

Wait and until blocks are rare: most tasks have a scheduled or due date, and then those win.
A waiting task shows on the Calendar like any other, since it's part of what's coming.

How tall a block is comes from the task's duration, the `sched_duration` or `due_duration` [UDA](../taskwarrior/udas.md) (see [Settings](settings.md#tw-web-rc)):

```
$ task add Team meeting scheduled:tomorrow+10h sched_duration:90min
```

draws a block from 10:00 to 11:30.
Without a duration, a scheduled block is drawn an hour tall and a due one half an hour; that's only how it's drawn, nothing is written to the task.

A task whose time is midnight has a date but no time, so it goes in the **all-day** strip at the top of Week and Day, and shows as a bar in Month:

```
$ task add Mum's birthday scheduled:2026-12-03
```

Tap **all-day ▾** to fold the strip away and give the hours the room; each device remembers.
A day's header then counts what's hidden, "2 all-day", and a tap brings the strip back.

Completed tasks show in grey and deleted ones in purple when you pick those statuses; they can't be moved.

## Moving and stretching

Drag a block to another time or day, and tw-web changes the date it's shown by, as if you'd typed:

```
$ task 12 modify scheduled:2026-11-26T14:00
```

A due block changes `due`, a wait block `wait` and an until block `until`, the same way.
Drag the bottom edge of a scheduled or due block to change how long it is, and that writes its duration too; wait and until blocks have no duration, so they only move.
Moves snap to 15 minutes.
Your hooks run on every change, and if one refuses, the block goes back where it was, with the hook's message.

## Clicking

Click a task to see its details, with buttons to **start** or **stop** it, **edit** it, **unschedule** it (📅, on a scheduled block: clears the scheduled date, so it goes back to the Unscheduled column), mark it **done**, or **delete** it.

Click an empty time to add a task scheduled there.
Better still, drag down over a stretch of time: the Add dialog opens with the start and the duration already filled in.
Drag over the all-day strip for a date with no time.

## The Unscheduled column

On a wide window, the column at the right lists your pending tasks, waiting ones included, that have neither a scheduled nor a due date.
Drag one onto the grid to schedule it.

A task with only a wait or until date is in both places: on the grid at that date, and in the column, since it isn't really planned yet.
Dragging it from the column gives it a scheduled time, and from then on that's where it shows.
It has its own sort (⇅, the same choices as the [List](list.md)) and card/row switch.

The nav bar's filter and context narrow this column, so typing `home` in the project input leaves the Home tasks waiting to be planned.
The grid itself follows only the status buttons, so what's planned never vanishes from the calendar because of a filter.

Below 1024 pixels wide the column hides, to give the grid the room.

## Zoom

Week and Day each have three zoom steps, set in **Settings → Week/Day zoom steps**: a row size and an hour to start at.
Clicking the active view's button (Day, Week), or pressing its key (`D`, `W`), or the spacebar, cycles to the next step; changing view or reloading goes back to the default.

All 24 hours are always there.
When tasks are scrolled out of sight, a marker at the top or bottom edge says so, "↑ 2 earlier", and clicking it brings the nearest one into view.

## Daylight

A cyan stripe down the time column runs from sunrise to sunset, fading at either end for twilight.
Hover the time column for the times.
It needs to know where you are: **Settings → Calendar → Daylight**.

## Holidays and events

Holidays, your own events, the moon's phases, the seasons and the clock changes show on the Calendar too, from [tw-events](https://github.com/linuxcaffe/tw-events).
They aren't tasks, and they don't move.
See [Holidays, events, moon & seasons](layers.md).

## On a phone

The whole page scrolls, with the nav bar, the date row and the day names staying on top.

Press and hold a task (about a third of a second) to pick it up, then move it; the page stays put.
A quick sideways swipe goes to the next or previous week, day or month.
In Week and Day, pinch to step through the zoom steps: spread your fingers for smaller rows, pinch them together for bigger ones; the time between your fingers stays put.

## See also

- [Agenda](agenda.md), for the same tasks as a list
- [Using dates](../taskwarrior/using_dates.md) and [Durations](../taskwarrior/durations.md)
- [Adding and editing](add-edit.md)
