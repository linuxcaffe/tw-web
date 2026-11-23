---
title: "Kanban"
category: "Views"
summary: "Columns from the state UDA, the Unassigned column, dragging cards"
---
# Kanban

The Kanban board lays your pending tasks out in columns, one for each stage of your work, and you move a task along by dragging its card.
Press `K` to get here.

[image: the Kanban board with Unassigned, backlog, todo, doing and done columns]

## Where the columns come from

Each column is a value of the `state` [UDA](../taskwarrior/udas.md), which tw-web sets up in its `tw-web.rc` (see [Settings](settings.md#tw-web-rc)).
The default columns are:

```
backlog, todo, doing, review, done
```

and you change them in **Settings → General → Kanban columns**: rename them, reorder them, add or drop one.

Dragging a card from **todo** to **doing** is the same as typing:

```
$ task 12 modify state:doing
```

so the state is right there for the command line, filters and reports to use, `task state:doing list` included.
Hooks run as they would for that `modify`.

## The Unassigned column

The first column, **Unassigned**, holds the pending tasks that have no state yet, which is most tasks when you start.
Drag one into a column to give it that state; drag a card back into Unassigned to clear it (`state:`).

Unassigned is the one column the nav bar's filter narrows.
Type `home` in the project input, and Unassigned shows only the Home tasks that haven't been placed yet, while the state columns keep showing everything on the board.
That makes it easy to pull the next few tasks of one project into **todo**.

The context applies to every column, as it does everywhere else.

## Statuses

The board is always pending tasks: the status buttons don't apply here.
A task you complete from a card leaves the board, whatever column it was in.
(The **done** column is a state like any other, for work that's finished but not yet closed. Complete the task when it's really done.)

## Moving around the board

When the columns don't all fit, the board shows as many as it can around the **focused** one, and Unassigned is the first to give way.
The column names also appear as pills in the nav bar:

- click a pill to bring that column into view
- `←` and `→` move the focus one column at a time
- `↑` and `↓` scroll the focused column

tw-web remembers the focused column, so leaving for the Agenda and coming back puts you where you were.

You can also drop a card on a pill: drag it up to the nav bar, the pills stack up so you can reach them all, and the card goes to that column even when it's off screen.

## Each column's own view

Every column has three small buttons in its header:

- **↕** picks its sort: Manual, Urgency, Due date, Priority, Project or Description (Urgency until you choose)
- **⊞** and **☰** switch it between cards and rows

Drag a card up or down within a column and that column switches to **Manual**, keeping the order you made.
The order is kept by the tw-web server, not in your tasks, so it's the same in every browser.

## On a phone

The board works the same way at phone width, with fewer columns in view.
Hold a card for a moment to pick it up, then drag; a pill in the nav bar is the easy way across.
(The short hold is there with a mouse too, so a click on a card doesn't start a drag.)

## See also

- [Settings](settings.md), for the columns and the `state` UDA
- [List](list.md), for what's on a card and its buttons
- *Filtering*
