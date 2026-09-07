-- FULL RESET — run in Supabase SQL Editor to wipe messy data and apply clean schema.
-- WARNING: deletes all workout and health data.

-- Drop old objects
drop view if exists exercise_last_performance;
drop table if exists workout_logs cascade;
drop table if exists session_exercises cascade;
drop table if exists workout_sessions cascade;
drop table if exists health_logs cascade;
drop table if exists books cascade;
drop table if exists mood_logs cascade;
drop table if exists spotify_tokens cascade;
drop table if exists portfolio_holdings cascade;
drop table if exists user_profiles cascade;
drop table if exists split_exercises cascade;
drop table if exists exercises cascade;
drop table if exists movements cascade;
drop table if exists workout_splits cascade;

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------

create table workout_splits (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Global movement catalog (one name = one chart line, no duplicates)
create table movements (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  target_muscle text not null,
  created_at timestamptz not null default now()
);

-- Template slot per split (which movements, default set count)
create table split_exercises (
  id uuid primary key default gen_random_uuid(),
  split_id uuid not null references workout_splits (id) on delete cascade,
  movement_id uuid not null references movements (id) on delete restrict,
  default_sets int not null default 3 check (default_sets >= 1),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (split_id, movement_id)
);

create table workout_sessions (
  id uuid primary key default gen_random_uuid(),
  split_id uuid not null references workout_splits (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  date date not null default (timezone('utc', now()))::date,
  is_seeded boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index workout_sessions_split_date_idx on workout_sessions (split_id, date desc);

-- What was actually performed in a session (supports substitution)
create table session_exercises (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references workout_sessions (id) on delete cascade,
  template_slot_id uuid references split_exercises (id) on delete restrict,
  movement_id uuid not null references movements (id) on delete restrict,
  sort_order int not null default 0,
  note text,
  created_at timestamptz not null default now()
);

create unique index session_exercises_session_slot_idx
  on session_exercises (session_id, template_slot_id)
  where template_slot_id is not null;

-- Extra exercises have no slot to key on, so the movement is their identity.
create unique index session_exercises_session_movement_idx
  on session_exercises (session_id, movement_id)
  where template_slot_id is null;

create index session_exercises_movement_idx on session_exercises (movement_id);

create table workout_logs (
  id uuid primary key default gen_random_uuid(),
  session_exercise_id uuid not null references session_exercises (id) on delete cascade,
  set_number int not null check (set_number >= 1),
  weight_kg numeric(6, 2) not null check (weight_kg >= 0),
  reps numeric(4, 1) not null check (reps > 0),
  created_at timestamptz not null default now(),
  unique (session_exercise_id, set_number)
);

create table health_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  date date not null,
  weight_kg numeric(5, 2) check (weight_kg > 0),
  calories int check (calories >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create table user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  goal_type text check (goal_type in ('bulk', 'cut', 'maintain')),
  updated_at timestamptz not null default now()
);

create table books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  title text not null,
  author text,
  status text not null check (status in ('reading', 'finished')),
  started_on date,
  finished_on date,
  page_count int check (page_count > 0),
  rating numeric(2, 1) check (rating >= 1 and rating <= 5),
  note text,
  created_at timestamptz not null default now()
);

create index books_user_status_idx on books (user_id, status);
create index books_user_finished_idx on books (user_id, finished_on desc);

create table mood_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  date date not null,
  score int not null check (score >= 1 and score <= 5),
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create index mood_logs_user_date_idx on mood_logs (user_id, date desc);

create table spotify_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  refresh_token text not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS (dev-friendly anon policies)
-- ---------------------------------------------------------------------------

alter table workout_splits enable row level security;
alter table movements enable row level security;
alter table split_exercises enable row level security;
alter table workout_sessions enable row level security;
alter table session_exercises enable row level security;
alter table workout_logs enable row level security;
alter table health_logs enable row level security;
alter table user_profiles enable row level security;
alter table books enable row level security;
alter table mood_logs enable row level security;
alter table spotify_tokens enable row level security;

drop policy if exists "anon_all" on workout_splits;
drop policy if exists "anon_all" on movements;
drop policy if exists "anon_all" on split_exercises;
drop policy if exists "anon_all" on workout_sessions;
drop policy if exists "anon_all" on session_exercises;
drop policy if exists "anon_all" on workout_logs;
drop policy if exists "anon_all" on health_logs;
drop policy if exists "Allow anon read/write (dev only)" on health_logs;
drop policy if exists "auth_read_splits" on workout_splits;
drop policy if exists "auth_read_movements" on movements;
drop policy if exists "auth_insert_movements" on movements;
drop policy if exists "auth_read_split_exercises" on split_exercises;
drop policy if exists "users_own_sessions" on workout_sessions;
drop policy if exists "users_own_session_exercises" on session_exercises;
drop policy if exists "users_own_workout_logs" on workout_logs;
drop policy if exists "users_own_health_logs" on health_logs;
drop policy if exists "users_own_profiles" on user_profiles;
drop policy if exists "users_own_books" on books;
drop policy if exists "users_own_mood_logs" on mood_logs;
drop policy if exists "users_own_spotify_tokens" on spotify_tokens;

create policy "auth_read_splits" on workout_splits
  for select to authenticated using (true);

create policy "auth_read_movements" on movements
  for select to authenticated using (true);

create policy "auth_insert_movements" on movements
  for insert to authenticated with check (true);

create policy "auth_read_split_exercises" on split_exercises
  for select to authenticated using (true);

create policy "users_own_sessions" on workout_sessions
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users_own_session_exercises" on session_exercises
  for all to authenticated
  using (
    exists (
      select 1 from workout_sessions ws
      where ws.id = session_exercises.session_id
        and ws.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from workout_sessions ws
      where ws.id = session_exercises.session_id
        and ws.user_id = auth.uid()
    )
  );

create policy "users_own_workout_logs" on workout_logs
  for all to authenticated
  using (
    exists (
      select 1 from session_exercises se
      join workout_sessions ws on ws.id = se.session_id
      where se.id = workout_logs.session_exercise_id
        and ws.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from session_exercises se
      join workout_sessions ws on ws.id = se.session_id
      where se.id = workout_logs.session_exercise_id
        and ws.user_id = auth.uid()
    )
  );

create policy "users_own_health_logs" on health_logs
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users_own_profiles" on user_profiles
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users_own_books" on books
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users_own_mood_logs" on mood_logs
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users_own_spotify_tokens" on spotify_tokens
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Seed: splits
-- ---------------------------------------------------------------------------

insert into workout_splits (name, sort_order) values
  ('Push', 1),
  ('Pull', 2),
  ('Legs', 3),
  ('Upper', 4),
  ('Run', 5);

-- ---------------------------------------------------------------------------
-- Seed: movements (global catalog)
-- ---------------------------------------------------------------------------

-- Template movements + catalog-only alternatives
insert into movements (name, target_muscle) values
  ('Cable Chest Fly', 'Chest'),
  ('Incline DB Bench Press', 'Chest'),
  ('Dumbbell Shoulder Press', 'Shoulders'),
  ('Incline Chest Machine Press', 'Chest'),
  ('Cable Tricep Extension', 'Triceps'),
  ('Face Pull', 'Rear Delts'),
  ('Wide Grip Lat Pulldown', 'Back'),
  ('Close Grip Seated Cable Row', 'Back'),
  ('T-Bar Row', 'Back'),
  ('EZ Bar Bicep Curl', 'Biceps'),
  ('Leg Press', 'Quads'),
  ('RDL with Bar', 'Hamstrings'),
  ('Walking Lunges', 'Quads'),
  ('Hamstring Curl', 'Hamstrings'),
  ('Machine Calf Raise', 'Calves'),
  ('Cable Crunch', 'Core'),
  ('Chest Cable Machine', 'Chest'),
  ('Bench Press', 'Chest'),
  ('Close Grip Lat Pulldown', 'Back'),
  ('Horizontal Lat Row Machine', 'Back'),
  ('Barbell Squat', 'Quads'),
  ('Hip Thrust', 'Hamstrings'),
  ('Pec Deck / Pec Fly', 'Chest'),
  ('Machine Shoulder Press', 'Shoulders'),
  ('Dumbbell Bicep Curl', 'Biceps'),
  ('Dumbbell Flat Bench Press', 'Chest'),
  ('Machine Rear Delt Fly', 'Rear Delts'),
  ('Smith Machine Press', 'Chest'),
  ('Smith Machine Squat', 'Quads'),
  ('Leg Extension', 'Quads'),
  ('Preacher Bicep Curl', 'Biceps'),
  ('Dumbbell Hammer Curl', 'Biceps'),
  ('Pull-ups / Chin-ups', 'Back'),
  ('Barbell Row', 'Back'),
  ('Deadlift', 'Back'),
  ('Rack Pull', 'Back'),
  ('Straight Arm Pulldown', 'Back'),
  ('Dumbbell Fly', 'Chest'),
  ('Decline Bench Press', 'Chest'),
  ('Arnold Press', 'Shoulders'),
  ('Cable Lateral Raise', 'Shoulders'),
  ('Dumbbell Lateral Raise', 'Shoulders'),
  ('Tricep Pushdown', 'Triceps'),
  ('Skull Crushers', 'Triceps'),
  ('Overhead Tricep Extension', 'Triceps'),
  ('Hack Squat', 'Quads'),
  ('Incline Smith Machine Press', 'Chest'),
  ('Lateral Raises', 'Shoulders'),
  ('Tricep Straight Bar Pushdown', 'Triceps'),
  ('Tricep Rope Overhead Extension', 'Triceps'),
  ('Bulgarian Split Squat', 'Quads'),
  ('Seated Calf Raise', 'Calves'),
  ('Hanging Leg Raise', 'Core'),
  ('Ab Wheel', 'Core'),
  ('Treadmill Run', 'Cardio'),
  ('Outdoor Run', 'Cardio'),
  ('Stationary Bike', 'Cardio'),
  ('Stairmaster', 'Cardio');

-- ---------------------------------------------------------------------------
-- Seed: split templates
-- ---------------------------------------------------------------------------

insert into split_exercises (split_id, movement_id, default_sets, sort_order)
select s.id, m.id, t.default_sets, t.sort_order
from workout_splits s
join (values
  ('Push', 'Cable Chest Fly', 2, 1),
  ('Push', 'Incline DB Bench Press', 2, 2),
  ('Push', 'Dumbbell Shoulder Press', 3, 3),
  ('Push', 'Incline Chest Machine Press', 2, 4),
  ('Push', 'Cable Tricep Extension', 3, 5),
  ('Pull', 'Face Pull', 2, 1),
  ('Pull', 'Wide Grip Lat Pulldown', 2, 2),
  ('Pull', 'Close Grip Seated Cable Row', 2, 3),
  ('Pull', 'T-Bar Row', 2, 4),
  ('Pull', 'EZ Bar Bicep Curl', 3, 5),
  ('Legs', 'Leg Press', 3, 1),
  ('Legs', 'RDL with Bar', 3, 2),
  ('Legs', 'Walking Lunges', 2, 3),
  ('Legs', 'Hamstring Curl', 3, 4),
  ('Legs', 'Machine Calf Raise', 3, 5),
  ('Legs', 'Cable Crunch', 3, 6),
  ('Upper', 'Chest Cable Machine', 3, 1),
  ('Upper', 'Bench Press', 3, 2),
  ('Upper', 'Close Grip Lat Pulldown', 3, 3),
  ('Upper', 'Incline DB Bench Press', 3, 4),
  ('Upper', 'Horizontal Lat Row Machine', 3, 5),
  ('Run', 'Treadmill Run', 1, 1)
) as t(split_name, movement_name, default_sets, sort_order)
  on t.split_name = s.name
join movements m on m.name = t.movement_name;
