"""
tw-web configuration settings

Runtime settings (notification timeout, calendar options, kanban columns) live in
Menu → Settings and are saved to settings.json — no server restart needed.

This file is for deployment-level overrides only.
"""

# Developer mode settings
DEVELOPER_MODE = False
DEBUG_FILE = 'command.debug'

# Kanban board columns — optional deployment override.
# Normally set via Menu → Settings. Uncomment to hard-code at the server level.
# Must match 'state' UDA values; tasks with no state appear in "Unassigned".
#   uda.state.type=string  (add to tw-web.rc)
#
# KANBAN_COLUMNS = ['backlog', 'todo', 'doing', 'review', 'done']
