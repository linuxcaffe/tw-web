---
title: "Recurrence"
category: "Working with tasks"
summary: "Recurring tasks with the recurrence-overhaul hook: the Recur line, templates and instances, the ring round the dot"
---
# Recurrence

Some tasks come back: the rent, the recycling, a weekly review.
tw-web handles them with the [recurrence-overhaul hook](https://github.com/linuxcaffe/tw-recurrence_overhaul-hook), which replaces Taskwarrior's own [recurrence](../taskwarrior/recurrence.md) with rules that know about real months and weekdays.
The hook decides everything; tw-web shows you what it did, and passes on what it says.

Install it with:

```
$ tw -I recurrence-overhaul
```

## Templates and instances

A recurring task is two kinds of task.

The **template** holds the rule, and stays out of sight, like Taskwarrior's own recurring parents.
The **instances** are the real tasks the hook makes from it, one at a time: the one you see on the List, complete, and see the next one appear.

On a card, a ring round the priority dot tells them apart:

- a **violet** ring is a template
- a **green** ring is an instance

The ring is there even when the task has no priority.
To see your templates, pick **Recur** in the status buttons.

[image: two cards, one with a violet ring (the template), one with a green ring (its instance)]

## The Recur line

The Add and Edit dialog has a **Recur** line at the bottom, with three parts.

**The rule**, the hook's `r` attribute.
Anything the hook understands goes:

```
1w          every week
2d          every other day
1mo         monthly, on the same day of the month
m:2tue      the second Tuesday of every month
```

**period** or **chain**: a period task comes back on the calendar whatever happens (the rent is due on the 1st whether you paid last month's late or not), while a chain comes back a set time after you complete the last one (water the plants a week after you last did).

**End** (`rend`) is the date the recurrence stops.

So adding "Pay the rent", due on the 1st, with `1mo` and **period**, is the same as:

```
$ task add Pay the rent due:1st r:1mo type:period
```

and the hook takes it from there: the task becomes the template, and the first instance appears.
Putting a rule on a task you already have turns that task into a template in the same way.

## Hints, and the hook's word

As you fill the line in, tw-web gives hints: a rule needs a due or scheduled date to count from, and a chain takes no Until (End is how a chain stops).
They're only hints.
The hook is the one that decides, and if it refuses, its own words come back to you after the save.

## Editing a template

A template's Wait, Scheduled and Until show as dates, as you'd expect, but they're saved as offsets from its anchor date, the due date or else the scheduled one (`rwait:due-604800s`), so every later instance gets them at the same distance.
Change the template, and the instances from then on follow.

## Editing an instance

An instance is a task like any other: edit anything, and the change is to that instance only.
Its Recur line shows its template's rule instead of an input, with a link to edit the template.
If you'd like a change to carry forward, the hook says what to run after the save.

## See also

- [Adding and editing](add-edit.md)
- [Settings](settings.md#tw-web-rc), for `recurrence=no` and `recurrence.field=r`
- [recurrence-overhaul](https://github.com/linuxcaffe/tw-recurrence_overhaul-hook), for every rule it reads
