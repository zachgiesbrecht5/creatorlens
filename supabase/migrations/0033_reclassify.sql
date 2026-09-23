-- Re-classify brands whose category looks wrong or is missing, now that the
-- classifier reads caption evidence. Clearing classified_at puts them back in the queue.
update brands set classified_at = null
where is_junk = false and category_locked = false
  and (category is null or category = 'Business' or category = 'Other');
