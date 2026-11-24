---
title: "Kanban"
category: "Views"
summary: "Columns from the state UDA, the started and done columns, the Unassigned column, dragging cards"
---
# Kanban

The Kanban board lays your tasks out in columns, one for each stage of your work, and you move a task along by dragging its card.
Press `K` to get here.

[image: the Kanban board with Unassigned, backlog, todo, started, review and done columns]

## Where the columns come from

Each column is a value of the `state` [UDA](../taskwarrior/udas.md), which tw-web sets up in its `tw-web.rc` (see [Settings](settings.md#tw-web-rc)).
The default columns are:

```
backlog, todo, started, review, done
```

and you change them in **Settings → General → Kanban columns**: rename them, reorder them, add or drop one.

Dragging a card from **todo** to **review** is the same as typing:

```
$ task 12 modify state:review
```

so the state is right there for the command line, filters and reports to use, `task state:review list` included.
Hooks run as they would for that `modify`.

## The started and done columns

Two column names mean more than a state, wherever they are in the list.

**started** starts the task. Dragging a card in is, in effect:

```
$ task 12 modify state:started start:now
```

A task that was already started keeps its own start time. Dragging it out to another column stops it (`start:`).
A task you start from its card's **▶** button stays in its column; every started task shows the started colour, in any column.

**done** holds your *completed* tasks in the context, the most recently completed first.
Dragging a card in completes it (`task 12 done`), and dragging a completed card out reopens it into that column (`status:pending`), started again if it goes to **started**.
The column loads 50 at a time and fetches the next 50 as you scroll near its end (or press **More**); its header says how many of how many.

Drop either name from your columns and it's an ordinary state again, or no column at all.

## The Unassigned column

The first column, **Unassigned**, holds the pending tasks that have no state yet, which is most tasks when you start.
Drag one into a column to give it that state; drag a card back into Unassigned to clear it (`state:`).

The nav bar's filter and the context narrow every column, as they do on the [List](list.md).
Type `home` in the project input, and the board shows only the Home tasks.

The counter in the nav bar counts the cards in the columns between Unassigned and done (the work in hand) out of all your pending tasks, the List's total: `3/40`.

## Statuses

The status buttons don't apply here: every column is pending tasks, except **done**, which is completed ones.
A task you complete from a card moves to **done**, whatever column it was in. Deleted tasks are never on the board.

## Moving around the board

When the columns don't all fit, the board shows as many as it can around the **focused** one, and Unassigned is the first to give way.
The column names also appear as pills in the nav bar:

- click a pill to bring that column into view
- `←` and `→` move the focus one column at a time
- `↑` and `↓` scroll the focused column

The board opens on **todo** (on a phone, that's the one column you see).
tw-web remembers the focused column in that tab, so leaving for the Agenda and coming back puts you where you were.

You can also drop a card on a pill: drag it up to the nav bar, the pills stack up so you can reach them all, and the card goes to that column even when it's off screen.

## Each column's own view

Every column has three small buttons in its header:

- **↕** picks its sort: Manual, Urgency, Due date, Priority, Project, Description or Completed (Manual until you choose; **done** starts at Completed, newest first)
- **⊞** and **☰** switch it between cards and rows

Drag a card up or down within a column and that column switches to **Manual**, keeping the order you made.
Cards you haven't placed yet come after the ones you have, by urgency. **done** stays in completion order.
The order is kept by the tw-web server, not in your tasks, so it's the same in every browser.

## On a phone

The board works the same way at phone width, with fewer columns in view.
Hold a card for a moment to pick it up, then drag; a pill in the nav bar is the easy way across.
(The short hold is there with a mouse too, so a click on a card doesn't start a drag.)

## See also

- [Settings](settings.md), for the columns and the `state` UDA
- [List](list.md), for what's on a card and its buttons
- [Filtering](filter-bar.md)
