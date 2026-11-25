---
title: "Adding and editing"
category: "Working with tasks"
summary: "The Add and Edit dialog: fields, defaults from the filter, Log, annotations, only what you change is saved"
---
# Adding and editing

One dialog does both: adding a new task, and editing one you have.
Click **+** in the nav bar, or press `a`, to add; click ✏ on a card to edit.

[image: the Add dialog with description, project, tags, priority, dates and the Recur line]

## The fields

Everything in the dialog is something you could type on a `task add` line:

| Field | Means | On the command line |
|---|---|---|
| Description | what to do | `task add Fix the gate` |
| Project | which project | `project:home.garden` |
| tags | comma-separated | `+outside +weekend` |
| pri | priority: H, M, L, or 1–6 if you use them | `priority:H` |
| state | the Kanban column | `state:todo` |
| deps | the IDs it waits for; `-12`: task 12 waits for this one | `depends:42,55` |
| Due, Scheduled | dates and times | `due:friday scheduled:thursday+9h` |
| Due dur, Sched dur | how long, for the Calendar | `sched_duration:90min` |
| Wait, Until | hide until, expire at | `wait:due-7d until:due+2d` |
| Recur | a recurring rule (see [Recurrence](recurrence.md)) | `r:1w` |

The date fields are your browser's date-and-time pickers; each has a **×** to clear it.
A duration is written as Taskwarrior writes them: `30min`, `1h`, `1h30min`, `2d` (see [Durations](../taskwarrior/durations.md)).
What the fields mean is on [Using Dates Effectively](../taskwarrior/using_dates.md).

Taskwarrior takes dates in any order, but some orders don't make sense: scheduled after due, or wait after until.
The dialog says so under the dates, as a hint, and still saves what you asked for:

```
Scheduled is after due: the Agenda and Calendar show it at the due date.
```

The deps field lists the tasks this one waits for, by ID: `42, 55`.
When you edit a task, it shows its whole list (a task with no ID, completed or not in view, shows as a short UUID), and the list you save is the whole list: take an ID out, and that dependency goes.
Empty the field to clear them all.

It has one more trick: `-12` makes task 12 wait for this one, so you can put a step in front of something you already have.
It works when you add a task and when you edit one, and can go with the IDs it waits for (`42, -12`); one `-ID` per save.
The link lives on task 12, so when you open this task again, `-12` isn't in its field: open task 12 to see it, or to take it away.
Task 12 has to be pending or waiting, and it can't be this task.

## Save, or Log

**Save** adds the task.
**Log** adds it already done, like `task log`: handy for writing down something you finished without planning it.

Your hooks run on every save, as they would for `task add` or `task modify`.
If a hook changes something, adds a note, or refuses, you'll see what it said after the save.

## Starting from the filter

A new task starts with what the nav bar's filter names.
With `home` in the project input and `H` in priority, the dialog opens with project home and priority H already set.
Add a run of related tasks in a row without typing the project each time.
(Only values that name one thing count; see [Filtering](filter-bar.md#a-filter-starts-your-next-task).)
The project field also suggests the projects you already have, as you type.

## Editing

Editing reads the task fresh from Taskwarrior when the dialog opens, so you're never editing a stale copy.

When you save, tw-web sends only what you changed.
Change the due date and nothing else, and the save is, in effect:

```
$ task 12 modify due:2026-12-01
```

If you change nothing, nothing is written.
That matters when another device or a hook has touched the task since: only your change lands on top.

## Annotations

When you edit a task, its annotations are listed at the bottom of the dialog.
**+ Add annotation** adds one, and each existing one can be edited or deleted on the spot.
They're saved as soon as you click **Save note**, not with the rest of the dialog.
Links in them work as they do on the cards: see [Annotations and links](annotations.md).

## Completed and deleted tasks

Opening a completed or deleted task shows it read-only, with a banner saying so and a **Revert to pending** button to bring it back; once it's pending again, edit away.
See [Completed and deleted](completed.md).

## See also

- [Filtering](filter-bar.md)
- [Calendar](calendar.md), where dragging over a stretch of time opens Add with the time filled in
- [add](../taskwarrior/commands/add.md), [modify](../taskwarrior/commands/modify.md), [log](../taskwarrior/commands/log.md)
