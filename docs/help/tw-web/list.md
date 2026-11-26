---
title: "List"
category: "Views"
summary: "Your tasks as cards or rows: sorting, the status buttons, sidebars, card actions"
---
# List

The List is where tw-web starts, and it's the closest thing to running a report on the command line.
It shows the tasks that match the nav bar's status, context and filter, sorted most urgent first (by default), the same order `task next` would give you.

[image: the List with its Projects sidebar on the left, Tags on the right, and a few cards between]

Press `L` from any other view to come back here.

## The status and context buttons

Below the nav bar is a row of buttons.
On the right are the statuses: **Pending**, **Recur**, **Wait**, **Completed** and **Deleted**.
One is lit at a time, and the List shows tasks with that status.
**Recur** shows the recurring templates, and **Wait** the tasks that are hidden until their wait date.

On the left are your contexts, the ones your taskrc defines, plus **All** for no context at all.
Click **Work**, and the List shows what `task context work` would show on the command line:

```
context.work.read=+work or project:Office
```

tw-web keeps its own context, separate from the command line's.
Setting a context here never changes what `task` shows in a terminal, and the other way round.
See [Context](../taskwarrior/context.md) for how contexts work.

## The heading and the counter

The heading over the tasks says how many you're looking at, "12 Pending Tasks", and the counter by the **+** button in the nav bar says how many of how many: `12/40` means the filter let 12 of 40 through, and a single `40` means nothing is filtered out.
When a text filter is active, it shows beside the heading as a reminder.

## Cards and rows

The two buttons at the right of the heading switch between **cards** (⊞), with room for project, dates, tags and annotations, and **rows** (≡), one line per task.
The Agenda uses the same choice.

Click a card anywhere outside its buttons to unfold it and see everything: every attribute, annotations in full, and its UDAs.
Click again to fold it.

A card shows:

- a **priority dot**, red for H (and 1, 2), amber for M (3, 4), green for L (5, 6); a ring around it means a recurring task, see [Recurrence](recurrence.md)
- the **description**, then the project, due and scheduled dates, duration and tags; the due date turns amber when it's less than three days off, red once it's past
- an **extras** line for anything else, such as `dep:12` when it depends on task 12, or a UDA's value
- its **annotations**, with links you can click (see [Annotations and links](annotations.md))

A task that depends on others shows them right under it, indented, so you can see what's in the way.
A started task is highlighted, so what you're working on stands out.

## Acting on a task

Each card has its buttons on the right:

| Button | Does | Like |
|---|---|---|
| ▶ | start it | `task 12 start` |
| ⏸ | stop it | `task 12 stop` |
| ✏ | edit it | `task 12 edit`, but a form |
| ✓ | mark it done | `task 12 done` |
| ✕ | delete it, after you confirm | `task 12 delete` |

Your hooks run for every one of these, just as they do in a terminal.
If a hook needs to ask you something, the console opens so it can (see [The terminal console](console.md)).

A completed or deleted card has only the edit button, and shows its short UUID and end date first, since it has no ID any more.
A completed task's description is green and a deleted one's is struck through, here and on every other page.
To undo the last change, open **Sync** from the menu and use **Undo** (`task undo`).

## Sorting

The ⇅ button beside the heading picks the sort:

```
Urgency (default)   Priority   Due date   Description   Project
Created   Modified   Started   Scheduled   Wait date   ID   Tags
```

with **Reverse** to flip it.
The button lights up when the sort isn't the default, and its tooltip says what it is.
Completed and deleted tasks have their own sort, newest first by end date, so switching to **Completed** doesn't lose the order you chose for pending tasks.

Priority sorts 1 to 6, then H, M, L, then none: see [Priority](../taskwarrior/priority.md).

## The sidebars

On a wide window, the **Projects** sidebar sits on the left and **Tags** on the right.
Click a project, and the filter's project input takes it; click a tag, and it goes in the tags input.
**No project** and **No tags**, at the top of each, pick the tasks without one.

The Tags sidebar has three modes:

- **active**: the tags of the tasks on screen, most used first
- **all**: every tag you have
- **virtual**: Taskwarrior's [virtual tags](../taskwarrior/tags.md), such as `OVERDUE` and `READY`; hover one for what it means

As the window narrows, Tags goes first, then Projects.
Both are still in the menu (**Projects**, **Tags**), which is how you reach them on a phone.

More on what the filter inputs accept: [Filtering](filter-bar.md).

## See also

- [Adding and editing](add-edit.md)
- [Keyboard shortcuts](../keys.md)
- [Urgency](../taskwarrior/urgency.md), for why the List is in the order it is
