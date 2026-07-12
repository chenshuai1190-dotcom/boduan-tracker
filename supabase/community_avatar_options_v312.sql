-- Expand community profile avatar choices from 6 to 18 without changing existing keys.
-- Run this small transaction before deploying the v10.7.9.312 frontend.

begin;

alter table public.community_profiles
drop constraint if exists community_profiles_avatar_key_check;

alter table public.community_profiles
add constraint community_profiles_avatar_key_check
check (avatar_key in (
  'gold', 'blue', 'purple', 'green', 'cyan', 'silver',
  'wolf', 'fox', 'tiger', 'cat', 'eagle', 'panda',
  'cyber-cyan', 'cyber-magenta', 'cyber-void', 'cyber-red', 'cyber-visor', 'cyber-crystal'
));

commit;
