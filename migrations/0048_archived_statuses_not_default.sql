-- Archiving a status in the app clears its default flag; 0047 archived leftovers without doing so.
UPDATE task_statuses SET is_default = 0 WHERE archived = 1 AND is_default = 1;
