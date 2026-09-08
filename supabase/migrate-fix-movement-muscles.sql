-- Fix miscategorized movement target muscles
update movements
set target_muscle = 'Triceps'
where name = 'Katana Extension Tricep';

update movements
set target_muscle = 'Biceps'
where name = 'Bicep Machine Curl';

update movements
set target_muscle = 'Shoulders'
where name = 'Lateral Raise Machine';
