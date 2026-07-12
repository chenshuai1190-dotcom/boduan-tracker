-- Allow the server-only registration endpoint to create a completed community profile.
-- Browser roles remain restricted to owner-scoped select/insert/update through RLS.

begin;

revoke insert
on table public.community_profiles
from public, anon;

grant insert
on table public.community_profiles
to service_role;

commit;
