---
title: "Context"
category: "Advanced Topics"
source: "content/docs/context.md"
---
# Context

A context is associated with a location.
An example of this might be that you perform tasks in three locations:

- At the office
- At home
- Study

The tasks that pertain to your time in the office are meaningless if you are at home, and vice versa.
This is just an example, and your contexts will likely be very different.

If Taskwarrior allowed you to specify which context is currently active, then the tasks listed could be filtered accordingly
You would then be working within a context.
A context is therefore a named filter, and the current context is a form of default filter.

Since 2.6.0 a context has two parts (2.6.0):

- the **read** context, a filter applied to reports and other commands that filter the task list
- the **write** context, default modifications applied to new tasks (`add`, `log`) while the context is active

## Defining a Context

In order to work within a context, you first need to define that context.
Because a context is essentially a task filter, defining a context is really defining a named filter.
In this example, we define our contexts from the list above using the new `context define` command:

```
$ task context define work +work or +freelance
$ task context define study +school or +homework or +lab
$ task context define home -work -freelance -school -homework -lab
```

The context definition may contain any form of algebraic expression just like a filter.
In the example, the contexts are based entirely on tags.
Notice that `home` is defined as neither `work` nor `study`. This means that every task is accounted for, although this is not necessary.

It is an error to try to define a context with the names `define`, `list`, `show`, `none`, or `delete`.

`context define` sets both the read and the write context from the one definition, asking to confirm each.
A definition that is also a valid set of modifications, such as `project:Home +home`, becomes both.
A definition that contains `or` or a tag exclusion (`-work`), like all three above, can't be applied to a new task, so only the read context is set:

```
$ task context define study +school or +homework or +lab
The filter '+school or +homework or +lab' is not a valid modification string, because it contains contains the 'OR' operator.
As such, value for the write context cannot be set (context will not apply on task add / task log).

Please use 'task config context.study.write <default mods>' to set default attribute values for new tasks in this context manually.

Context 'study' defined (read only). Use 'task context study' to activate.
```

The read and write contexts can also be set separately, so a context can work only for reports, or only for commands that create tasks:

```
$ task config context.study.write +school
```

## Setting the Context

To set or switch the current context, simply:

```
$ task context home
$ task list
...
```

If you try to use an undefined context, Taskwarrior will report an error.

Now with the context set to `home`, all the tasks listed will pertain to the `home` context, as defined.
There will be a footnote after every report that reminds you of the current context.

## Showing the Context

Although the current context is included in a footnote after every report, this can be disabled with the verbosity controls.
To show the current context:

```
$ task context show
Context 'home' with

* read filter: '-work -freelance -school -homework -lab'
* write filter: ''

is currently applied.
```

This can also be obtained using `_get`:

```
$ task _get rc.context
home
```

## Listing All Contexts

You can list all the contexts using the new `context list` command:

```
$ task context list
Name  Type  Definition                              Active
----- ----- --------------------------------------- ------
home  read  -work -freelance -school -homework -lab yes
      write                                         yes
study read  +school or +homework or +lab            no
      write +school                                 no
work  read  +work or +freelance                     no
      write                                         no
```

`task context` with no arguments shows the same list.

## Clearing the Context

To clear the current context:

```
$ task context none
```

The context `none` has special meaning
All subsequent commands will not have any implicit context filters applied.

## Deleting a Context

To delete one of the contexts:

```
$ task context delete study
```

Now you can no longer set the context to `study`. If the current context was already `study` when you deleted it, the context is cleared.

## Impact on Commands

All reports that accept filters will use the read context if one is defined and set, as do these commands:
`burndown`, `count`, `delete`, `denotate`, `done`, `duplicate`, `edit`, `history`, `prepend`, `projects`, `purge`, `start`, `stats`, `stop`, `summary`, `tags`.

`add` and `log` apply the write context to the new task.
All other commands are not affected by the context.

## Related Support

The `tasksh` program will show the current context in its prompt.

## Implementation Details

The current context is stored as `context=<name>` in the `.taskrc` file, and each defined context as `context.<name>.read=<filter>` and `context.<name>.write=<modifications>`.

A context can also override any other setting while it is active, with `context.<name>.rc.<key>=<value>`:

```
context.home.rc.default.command=home_report
```

A definition in the pre-2.6 form, `context.<name>=<filter>`, is still read, as a read context with no write context.

When a context filter is used, it will be implicitly surrounded by parentheses, so that it may contain arbitrary logic.
