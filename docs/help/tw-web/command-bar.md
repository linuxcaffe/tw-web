---
title: "The command bar"
category: "Working with tasks"
summary: "Type any task command or filter: what runs in place and what opens the console"
---
# The command bar

Sometimes it's quicker to type it.
The command bar takes anything you'd type after `task` in a terminal, and does the right thing with it.

Click the ⇅ button at the left of the filter inputs (or press `f`, then `Enter`), and the four inputs give way to one long one.

[image: the command bar open in the nav bar, with "253 mod project:home" typed]

## Two kinds of line

**A filter** on its own, with no command word, becomes the List's filter:

```
due.before:eow +work
(project:home or project:garden) -later
/dentist/
```

The List shows what `task <that> list` would, and the filter stays until you clear it (its **×**, or `Esc`).
From another view, tw-web takes you to the List to show it.

**A command** runs in the console, a real terminal that opens under the nav bar:

```
add Clean the kitchen due:tomorrow
253 mod project:home
ghistory.monthly
diag
```

It runs just as it would in a shell, so your hooks run, prompts get answered, and colours and charts look right.
When it's done, the console says `[done]`; press any key to close it, and the view refreshes to show what changed.

## What counts as a command

A command word is anything Taskwarrior itself would take as one:

- a command or report, your own custom reports included (`ghistory`, `next`, `mylist`)
- an alias from your taskrc
- an abbreviation long enough to name just one command, at least `abbreviation.minimum` letters (2 by default)

So `mod` and `proj` are commands, but `co` is read as a filter, since it could be `columns`, `config`, `count` and more.
The **Commands** tab of this Help lists every command `task` knows here, yours included.

A line starting with a task ID (`253 done`) is a command too.

## Confirmations

Changing many tasks at once asks first, as it does in a shell:

```
+later modify wait:monday
```

opens the console, and Taskwarrior asks "Modify 12 tasks?" there.
You answer in the console; your `bulk` and `confirmation` settings apply as usual.
See [Configuration](../taskwarrior/configuration.md).

## History

`↑` and `↓` step through the lines you've typed before, as in a shell.

## Back to the inputs

Click ⇅ again to go back to the four filter inputs.
Switching either way starts clean: the command bar empties the inputs, and going back empties the command bar.

## See also

- [The terminal console](console.md)
- [Filtering](filter-bar.md)
- [Syntax](../taskwarrior/syntax.md), for how `task` reads a command line
