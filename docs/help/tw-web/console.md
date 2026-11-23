---
title: "The terminal console"
category: "Working with tasks"
summary: "A real terminal under the nav bar: when it opens, hook prompts, a shell of your own"
---
# The terminal console

Some things need a terminal: a hook that asks a question, a bulk change Taskwarrior wants you to confirm, a chart drawn in colour.
For those, tw-web opens a real terminal, the console, right under the nav bar, on the machine the tw-web server runs on.

[image: the console open under the nav bar, showing "task ghistory.monthly" with its coloured chart]

It's a genuine terminal, not a copy of one, so anything that works in your shell works here.

## When it opens

**When you type a command** in the command bar: `253 mod project:home`, `ghistory`, `diag`.
See [The command bar](command-bar.md).

**When a hook asks for it.**
tw-web runs your hooks with no terminal attached, and tells them so (`TW_NOINTERACT=1`).
A well-behaved hook that needs to ask you something says so instead of hanging, and tw-web runs the same command again in the console, where the hook can ask.
Say a hook wants a reason whenever a task is deleted: click ✕ on a card, and the console opens with `task 12 delete` running, and the hook's question waiting for you.

**When a change takes too long.**
A change that hasn't finished after 15 seconds is stopped, and tw-web offers to run it in the console instead:

```
Timed out — run in terminal?
task 12 done
▶ Open in terminal     Dismiss
```

A similar offer, "Action queued — run in terminal?" (or the hook's own reason), appears when a hook put a command aside for later, to run where it can talk to you.

**When you ask for a shell.**
**Menu → Terminal**, or the `t` key, opens the console with your own shell, in the folder and with the start-up commands set in **Settings → Terminal**.
Type `exit` to close it.

## Inside the console

The title bar says what's running, and why, when a hook gave a reason.
When a command finishes, the console prints `[done]`; press any key to close it, and the page refreshes, since the command may have changed any task.

Drag the console's bottom edge to make it taller or shorter; tw-web remembers the height.
The **×** closes it at any time.

In the console, Taskwarrior and your hooks see a terminal like any other: `TW_NOINTERACT` and the rest of tw-web's signals are cleared, so prompts, editors and confirmations behave as they do in your shell.

## Nothing runs through a shell by accident

The command bar's text goes to `task` as arguments, never through a shell, so `add Fish & chips` adds a task called "Fish & chips" rather than starting a second command.
Only **Menu → Terminal** gives you a shell, and then you're typing into it yourself.

## See also

- [The command bar](command-bar.md)
- [Hooks](../taskwarrior/hooks.md), for how Taskwarrior runs them
- [Settings](settings.md#terminal)
