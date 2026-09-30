-- Clean up unperformed template exercises (exercises with no logged sets and no note)
-- in completed workout sessions.

delete from session_exercises se
where se.id in (
  select se2.id
  from session_exercises se2
  join workout_sessions ws on ws.id = se2.session_id
  where ws.completed_at is not null
    and (se2.note is null or trim(se2.note) = '')
    and not exists (
      select 1
      from workout_logs wl
      where wl.session_exercise_id = se2.id
    )
);
