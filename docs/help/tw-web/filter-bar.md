---
title: "Filtering"
category: "Working with tasks"
summary: "The filter, priority, project and tags inputs, their modifiers, virtual tags and context"
---
# Filtering

The nav bar's four small inputs narrow what every view shows: **filter** (the description), **p..** (priority), **project..** and **tags..**.
Type in one, and the view follows as you type.

[image: the nav bar's filter inputs with "home" in project and "OVERDUE" in tags]

They work like the filter part of a `task` command line, a little friendlier.
Typing `home` in the project input and `next` in the tags input is close to:

```
$ task project:home +next list
```

## Plain words

A word in an input matches the way you'd expect:

```
milk          description contains "milk"
home          project home, or any project under it (home.garden)
next,work     tags: has both next and work (commas or spaces)
+next -later  tags: has next, doesn't have later
```

## Modifiers

Each input also takes Taskwarrior's [attribute modifiers](../taskwarrior/filter.md), written with a leading dot:

```
.is:home      exactly home (not home.garden)
.not:home     anything but home
.any:         has a value at all
.none:        has none: no project, no tags, no priority
.has:next     (tags) has next
.hasnt:later  (tags) doesn't have later
```

Priority compares, too, from H (and 1, 2) down to L (and 5, 6):

```
> M           higher than Medium
< M           lower than Medium
```

## Virtual tags

Taskwarrior works out some tags for itself from other fields: `OVERDUE`, `DUE`, `TODAY`, `ACTIVE`, `BLOCKED`, `READY`, `WAITING` and the rest of the list on [Tags & Virtual Tags](../taskwarrior/tags.md).
Type one in the tags input, upper case, like any other tag:

```
home OVERDUE       a real tag and a virtual one
-BLOCKED           nothing that's waiting on another task
```

Taskwarrior itself decides which tasks match, so `DUE` means exactly what it means on the command line, `rc.due` and all.
The Tags sidebar's **virtual** mode lists them, with what each one means on hover.

Case matters: `next` and `NEXT` are both ordinary tags, since 2.6.2 has no virtual `NEXT`.

## Context

The context buttons, below the nav bar, apply one of your taskrc's [contexts](../taskwarrior/context.md) on top of the filter.
**All** turns it off.

tw-web's context is its own: choosing one here doesn't change `task context` in a terminal, and setting one in a terminal doesn't change tw-web.

## One filter, every view

The filter means the same thing on the [List](list.md), the [Agenda](agenda.md) and the [Kanban](kanban.md) board's Unassigned column.
The [Calendar](calendar.md) is the exception: its grid follows only the status buttons, so a planned task never vanishes from it, while its Unscheduled column follows the filter and context.

## A filter starts your next task

Adding a task starts from what the filter names.
With `home` in project and `H` in priority, every task you add is `project:home priority:H` until you change it, which makes adding a run of related tasks quick.

Only values that name one thing count: `home`, `.is:home`, `.has:next`, the `+` tags of `+next -later`.
Ranges, negatives, virtual tags and the description don't.
See [Adding and editing](add-edit.md).

## The whole expression

When the four inputs aren't enough, switch to the command bar (the ⇅ button, or `f` then `Enter`) and type a whole filter:

```
due.before:eow +work
(project:home or project:garden) -later
```

That becomes the List's filter (from another view, tw-web takes you to the List), until you clear it with its **×** or `Esc`.
Switching to the command bar empties the four inputs, so the two never fight.
See [The command bar](command-bar.md).

## Clearing

Each input has its own **×**.
`Esc` leaves an input; `f` puts the focus on the ⇅ button, so `Enter` then switches between the inputs and the command bar.
