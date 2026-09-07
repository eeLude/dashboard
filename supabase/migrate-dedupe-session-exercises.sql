-- Fix duplicated extra exercises inside a workout session.
-- Deletes rows, so run `npm run backup` first.

-- 1. Preview what will be removed (optional).
select se.session_id, m.name, count(*) as copies
from session_exercises se
join movements m on m.id = se.movement_id
where se.template_slot_id is null
group by se.session_id, m.name
having count(*) > 1;

-- 2. Keep the copy with the most logged sets, drop the rest.
with ranked as (
  select
    se.id,
    row_number() over (
      partition by se.session_id, se.movement_id
      order by
        (
          select count(*)
          from workout_logs wl
          where wl.session_exercise_id = se.id
        ) desc,
        se.sort_order,
        se.created_at
    ) as copy_rank
  from session_exercises se
  where se.template_slot_id is null
)
delete from session_exercises
where id in (select id from ranked where copy_rank > 1);

-- 3. Forbid new duplicates. Mirrors the slot index, which already covers
--    template rows via (session_id, template_slot_id).
create unique index if not exists session_exercises_session_movement_idx
  on session_exercises (session_id, movement_id)
  where template_slot_id is null;
