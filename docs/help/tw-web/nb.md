---
title: "Working with nb"
category: "Integrating"
summary: "Notes and tasks together: nb: links, a note per task, adding tasks from nb-web"
---
# Working with nb

[nb](https://github.com/xwmx/nb) keeps notes in plain files, and [nb-web](https://github.com/linuxcaffe/nb-web) shows them in a browser, much as tw-web shows your tasks.
The two are separate apps that link to each other: a task can point at a note, and a note can hold tasks.
Neither needs the other.

## A link to a note

Any annotation that starts with `nb:` is a link to a note:

```
$ task 12 annotate -- nb: home:garden/plan.md
```

On the card it's a link; click it, and the note opens in nb-web.
(The `--` keeps Taskwarrior from reading anything in the note's name as an attribute; see [Escapes](../taskwarrior/escapes.md).)

tw-web finds nb-web at the first address that answers: the one this browser remembers, the `nb` launcher in **Settings → Annotation launchers**, then nb-web's usual port, 5001, on this machine.
When none answers, it asks you once for this device's nb-web address, and remembers it.

And when nb-web is down altogether, the link still works: on a phone the note opens in another app, and elsewhere tw-web shows a read-only copy from this device, saying why.

## A note for every task

A task can have a note of its own, for the thinking that doesn't fit in a description.
Annotate it with a bare `nb:`:

```
$ task 12 annotate nb:
```

and the [nbnotes hook](https://github.com/linuxcaffe/tw-nbnotes-hook) makes a note for the task, and turns the annotation into its link (`nb: tasknotes:kitchen/…note.md`).
The note carries the task's title, project, due date, priority and tags, and the task's UUID, so each can always find the other.

How it fits together on a phone and a computer, synced: [Task notes](https://github.com/linuxcaffe/tw-mobilize/blob/main/docs/task-notes.md).

## Going to nb-web

`N` goes to nb-web from any view, and so does the **nb-web** link at the bottom of the menu.
Both appear once tw-web knows nb-web's address.

## Tasks inside nb-web

From the other side, nb-web shows tasks in notes, as tw codeblocks and queries, and can add a task without leaving the note: it opens tw-web's own Add dialog in a frame, so your defaults and hooks apply just as they do here.
See nb-web's own help for those.

## See also

- [Annotations and links](annotations.md)
- [Settings](settings.md#annotation-launchers)
