---
title: "What tw-web is"
category: "Getting started"
summary: "A web face for Taskwarrior 2.6.2: your tasks, hooks and settings, in a browser"
---
# What tw-web is

tw-web is Taskwarrior in a browser.
It shows the same tasks `task` shows you in a terminal, changes them the same way, and runs the same hooks, but with four views you can click, drag and filter, on a laptop or a phone.

[image: the List, Kanban, Agenda and Calendar side by side]

It's for [Taskwarrior 2.6.2](../taskwarrior/introduction.md).
Under the hood, everything tw-web does is a `task` command: completing a card is `task 12 done`, dragging it on the Calendar is `task 12 modify scheduled:…`.
So nothing in your data is tw-web's own, and you can go back and forth between tw-web and the command line all day.

## Not a simpler Taskwarrior

Many web front ends hide Taskwarrior behind a simpler model, and the moment you need a real filter or a hook, you're back at the terminal.
tw-web goes the other way: it lets Taskwarrior show through.

- The [filter inputs](filter-bar.md) take Taskwarrior's own modifiers, `.is:`, `.none:`, virtual tags and all.
- The [command bar](command-bar.md) takes any `task` command, your own reports and aliases included.
- Your **hooks** run on every change. When one needs to ask you something, a real terminal opens in the page so it can: [the console](console.md).

## The four views

- [List](list.md): your tasks as cards or rows, most urgent first
- [Kanban](kanban.md): columns you drag cards between
- [Agenda](agenda.md): what's scheduled and due, day by day
- [Calendar](calendar.md): a week on a grid, to plan by dragging

They share one nav bar, one filter and one context, so switching views keeps you looking at the same tasks.

## A server and a page

tw-web is two parts.
A small server runs on your own machine, next to your `~/.task`, and talks to `task`.
The page you're reading runs in your browser and talks to that server.

By default the server only answers your own machine.
With [Tailscale](https://tailscale.com), your phone and your other devices can reach it too, privately; see [Installing](install.md).

## Part of a fleet

tw-web is one of a family of Taskwarrior tools, managed by [awesome-taskwarrior](https://github.com/linuxcaffe/awesome-taskwarrior) (`tw`).
It works best alongside some of them, and needs none of them:

- [gittw](https://github.com/linuxcaffe/gittw) keeps your tasks in git and syncs them between devices
- [recurrence-overhaul](https://github.com/linuxcaffe/tw-recurrence_overhaul-hook) does recurring tasks: see [Recurrence](recurrence.md)
- [tw-events](https://github.com/linuxcaffe/tw-events) puts holidays, your own events and the moon on the calendar
- [nb-web](https://github.com/linuxcaffe/nb-web) keeps notes that link to tasks and back
- [tw-mobilize](https://github.com/linuxcaffe/tw-mobilize) sets the whole thing up on an Android phone

## Where to next

- [Installing](install.md), if you haven't yet
- [Settings](settings.md), to make it yours
- [Keyboard shortcuts](../keys.md)
