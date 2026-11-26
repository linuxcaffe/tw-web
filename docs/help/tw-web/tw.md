---
title: "Working with tw"
category: "Integrating"
summary: "awesome-taskwarrior's tw and its fleet: what each app adds to tw-web, and how your hooks behave here"
---
# Working with tw

tw-web is one of a family of Taskwarrior tools, the fleet, kept by [awesome-taskwarrior](https://github.com/linuxcaffe/awesome-taskwarrior).
Its command, `tw`, installs and updates them, and wraps `task` for the command line.

`tw` isn't Taskwarrior: Taskwarrior's command is `task`, and everything in the [Taskwarrior](../taskwarrior/introduction.md) tab is about that.
`tw` is the package manager and toolbox around it.

## Installing and updating

```
$ tw -l                  # what's installed, and what's available
$ tw -i tw-web           # about one app
$ tw -I recurrence-overhaul
$ tw -u tw-web
```

tw-web's own install and update are in [Installing](install.md) and [Updating](update.md).

If you sync two stations, a computer and a phone, run `tw -I` and `tw -u` on one of them, the computer, and let the other get the apps by syncing: doing it on both makes their records clash.
See [On a phone](phone.md#syncing-with-your-computer).

## What the fleet adds to tw-web

tw-web needs none of them; each adds the part below.

| App | Install | What it adds here | See |
|---|---|---|---|
| gittw | `tw -I gittw` | Sync, by hand and automatic, between stations | [Syncing](sync.md) |
| recurrence-overhaul | `tw -I recurrence-overhaul` | Recurring tasks with real months and weekdays, and the editor's Recur line. Without it, a rule is saved as a plain `r` and the Recur line warns | [Recurrence](recurrence.md) |
| tw-events | `tw -I events` | Holidays, your own events, moon, seasons and clock changes on the Calendar and Agenda | [Holidays, events, moon & seasons](layers.md) |
| nbnotes | `tw -I nbnotes` | A note of its own for a task, from a bare `nb:` annotation | [Working with nb](nb.md#a-note-for-every-task) |
| tw-mobilize | `tw -I mobilize` | tw-web on an Android phone, with a home-screen button | [On a phone](phone.md) |

## tw-web runs task, not tw

Everything tw-web does to your tasks, it does by running `task`, with your taskrc and your hooks.
It never runs `tw`, so `tw`'s own extras (its pager, its shell, `tw.ui`) don't apply here.

Two things differ from `task` in a terminal, both on purpose:

- **Reading runs no hooks.** Showing a view, filtering, counting: all of it runs with `rc.hooks=off`, so a hook that acts when Taskwarrior exits doesn't fire every time a page refreshes.
  Adding, changing, completing and deleting run your hooks as usual.
- **Nothing reads the command line's context.** tw-web's context is the one in its nav bar; see [Filtering](filter-bar.md).

## Your hooks in tw-web

When tw-web runs `task`, there's no terminal for a hook to ask questions in, and tw-web says so in the environment:

| Variable | Value | Meaning |
|---|---|---|
| `TW_NOINTERACT` | `1` | No terminal: don't prompt, don't open `/dev/tty`, don't start an editor |
| `TW_CLIENT` | `web` | Which client is calling: for wording, never for deciding whether to prompt |
| `TW_WEB` | `1` | The older name for `TW_NOINTERACT`, for hooks written before it |
| `TW_SPOOL_DIR` | a folder | Where a hook may leave a command to run later |

The fleet's hooks know these, and so can yours.
A hook that needs you has three ways to say so, and tw-web answers each in the [console](console.md):

- **"I need a terminal."** The hook stops the change and says so on stderr (`tw_needs_pty`, with the command and a reason).
  tw-web opens the console and runs the same command there, where the hook can ask.
- **"Do this later."** The hook lets the change through and leaves a command in `TW_SPOOL_DIR`.
  tw-web offers to run it in the console: "Action queued — run in terminal?", or the hook's own reason.
- **It takes too long.** A change still running after 15 seconds is stopped, and tw-web offers to run it in the console.

In the console the hook sees a terminal like any other: `TW_NOINTERACT` and the rest are cleared.

The rules, with examples in Python and shell, are in the fleet's [conventions](https://github.com/linuxcaffe/awesome-taskwarrior/blob/main/CONVENTIONS.md).

## See also

- [Hooks](../taskwarrior/hooks.md), for how Taskwarrior runs them
- [The terminal console](console.md)
- [Working with nb](nb.md)
