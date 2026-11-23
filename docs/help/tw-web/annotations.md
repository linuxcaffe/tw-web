---
title: "Annotations and links"
category: "Working with tasks"
summary: "Links in annotations, and launchers: label: value opens a file, a note or anything you set up"
---
# Annotations and links

An annotation is a note added to a task, with the date you added it.
tw-web shows them on the task's card, and turns the useful ones into links.

```
$ task 12 annotate https://example.com/manual.pdf
$ task 12 annotate -- nb: home:garden/plan.md
```

[image: a card with a web link and an nb: annotation, both shown as links]

## Web links

Any web address in an annotation is a link: `https://`, `http://`, `ftp://`, `file://` and `mailto:`.
Click it, and it opens in a new tab.
That's the easy way to keep a task's reference material with it: the bug report, the recipe, the shop.

## Launchers

An annotation that starts with a **label**, a colon and a value is a launcher, when tw-web knows that label:

```
file: ~/Documents/lease.pdf
nb: home:garden/plan.md
```

Click it, and tw-web runs the label's command with the value.
Two come with tw-web:

| Label | Does |
|---|---|
| `file` | opens the file with your desktop's usual app (`xdg-open`) |
| `nb` | opens the note in [nb-web](https://github.com/linuxcaffe/nb-web) |

You add your own in **Settings → Annotation launchers**.
A launcher is a label and a command, with `{value}` where the value goes:

```
man     xterm -e man {value}
```

and then `man: task` in any annotation opens the man page.
A command that's a web address opens in the browser; anything else runs on the machine the tw-web server runs on.
The value always stays one argument, whatever's in it, and never goes through a shell.

A label tw-web doesn't know stays plain text, so `Note: call back Monday` is just a note.

## nb notes

The `nb` launcher is the link to your notes.
When nb-web isn't answering, tw-web doesn't leave you with a dead link: on a phone it opens the note in another app, and elsewhere it shows a read-only copy from this device, saying why.
More: *Working with nb*.

## Adding, editing and deleting

In the Edit dialog, the task's annotations are listed at the bottom: **+ Add annotation** for a new one, and each existing one can be changed or deleted there.
See [Adding and editing](add-edit.md#annotations).
In the command bar, `12 annotate …` and `12 denotate …` work too.

## See also

- [Settings](settings.md#annotation-launchers)
- [append](../taskwarrior/commands/append.md) and [prepend](../taskwarrior/commands/prepend.md), the other ways to add to a task's text
