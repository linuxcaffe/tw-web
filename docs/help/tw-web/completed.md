---
title: "Completed and deleted"
category: "Working with tasks"
summary: "Seeing finished and deleted tasks, bringing one back, and undo"
---
# Completed and deleted

Done isn't gone.
Taskwarrior keeps every task you complete or delete, and tw-web lets you look back through them.

## Seeing them

Click **Completed** or **Deleted** in the status buttons.
The List shows those tasks newest first, by the date they ended, the way `task completed` does:

[image: the List showing completed tasks, each card starting with its short UUID and end date]

They have no ID numbers any more ([IDs](../taskwarrior/ids.md) belong to pending tasks), so each card starts with its short UUID and the date it ended instead:

```
uuid:c0ab2bf6  end:2026-11-20
```

Everything else works as usual: the filter, the context, the sidebars, and a sort of their own (End date, newest first, until you pick another).
The Agenda turns into a history the same way, newest day first.
The Calendar shows completed tasks in grey and deleted ones in purple, where they were planned.

## Bringing one back

Click ✏ on a completed or deleted card.
The dialog shows it read-only, with a banner and a **Revert to pending** button:

```
Status: completed        Revert to pending
```

That's the same as:

```
$ task c0ab2bf6 modify status:pending
```

and the task is back on the List, with its ID, ready to edit.

## Undo

Made a mistake just now? **Menu → Sync** has an **Undo** button, which runs `task undo`: it reverses the last change to any task, whatever made it.
It asks before it does.
See *Syncing* for the rest of that dialog.

## See also

- [List](list.md)
- [Searching](../taskwarrior/searching.md), for finding an old task by its words
