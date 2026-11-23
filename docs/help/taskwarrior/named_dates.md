---
title: "Named Dates"
category: "Basic Usage"
source: "content/docs/named_dates.md"
---
# Named Dates

The term 'date' is used here to describe a timestamp of varying precision and specificity.
The terms 'timestamp', or 'datetime' also apply.

Taskwarrior supports the notion of specifying dates in several ways.
There are ISO-8601 dates:

```
2014-06-07T16:55:04-05:00
2014-W23
20140607
```

There are `rc.dateformat` dates, the default being `Y-M-D`:

```
2014-06-07
```

This document enumerates and defines other dates, such as `tomorrow` and many others.

## Days of the Week

The days of the week are interpreted as the next day in the future.
To specify a day in the past, use a different date format.

* `mon`, `monday` - The date of the nearest future monday at 0:00:00 local.

The days are recognized in three-letter abbreviated form and the full day name only.

## Day Ordinals

Day ordinals are the days in the month, numbered starting from 1, to either the 28th, 29th, 30th or 31st, depending on the current month.

* `1st`, `2nd`, `3rd`, ...  - The date of the nearest future Nth day at 0:00:00 local.

Today's own number gives next month's: on the 23rd, `23rd` is the 23rd of next month.
A day the month doesn't have rolls over rather than failing: in November, `31st` is December 1st.
For an exact day, use a precise date format.

## Months of the Year

The months of the year are interpreted as the first day of the next month of that name in the future.
To specify a month in the past, use a different date format.

* `jan`, `january`   - The date of the nearest future January 1st, at 0:00:00 local.

The months are recognized in three-letter abbreviated form and the full month name only.

## Period Dates

Period dates name the start or the end of the current day, week, work week, month, quarter or year.
The abbreviations use 's' for the start and 'e' for the end, then the period: 'd' (day), 'w' (week),
'ww' (work week), 'm' (month), 'q' (quarter), 'y' (year).

* `sod`, `eod`   - Start of today, 0:00:00. End of today, 23:59:59.
* `sow`, `eow`   - Start of this week, Monday 0:00:00. End of this week, Sunday 23:59:59.
* `soww`, `eoww` - Start of this work week, Monday 0:00:00. End of it, Friday 23:59:59.
* `som`, `eom`   - Start of this month, the 1st at 0:00:00. End of this month, its last day at 23:59:59.
* `soq`, `eoq`   - Start of this quarter. End of this quarter, 23:59:59.
* `soy`, `eoy`   - Start of this year, January 1st 0:00:00. End of this year, December 31st 23:59:59.

So a start date is already past (`som` on the 23rd is the 1st of this month), and an end date is the
last second of the period. Weeks run Monday to Sunday here whatever `weekstart` says.
Taskwarrior 2.6.2 has no `socw`, `eocm` or other "current" (`c`) forms; an unknown name is taken as text.

* `yesterday`    - Start of yesterday. Time is 0:00:00 local.
* `today`        - Start of today. Time is 0:00:00 local.
* `now`          - Right now.
* `tomorrow`     - Start of tomorrow. Time is 0:00:00 local.

`task calc` shows what any of these means right now, without touching your tasks:
```
$ task calc eom
2026-11-30T23:59:59
```

## Calculated Dates

These dates are from algorithms, and easily calculated.

* `later`, `someday`                                               - December 30th, 9999 - the end of time. Time is 0:00:00 local.
* `easter`, `eastermonday`, `pentecost`, `ascension`, `goodfriday` - Time is 0:00:00 local.
* `midsommarafton`, `midsommar`                                    - First Friday and Saturday after 19th June. Time is 0:00:00 local.
