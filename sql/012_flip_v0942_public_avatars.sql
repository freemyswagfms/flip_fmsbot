-- FLIP v0.9.4.2 — resolve public-profile avatar targets privately.
-- The Telegram user ID is visible only to the authenticated Vercel server
-- using its service_role key. Public profile responses never include it.
create or replace function public.flip_public_avatar_target(p_public_id uuid)
returns bigint
language sql stable security invoker set search_path = ''
as $$
  select p.telegram_id
  from public.flip_players p
  where p.public_id = p_public_id
  limit 1
$$;

revoke all on function public.flip_public_avatar_target(uuid)
  from public, anon, authenticated;
grant execute on function public.flip_public_avatar_target(uuid)
  to service_role;
