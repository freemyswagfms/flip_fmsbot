-- FLIP STUDIO: non-destructive artwork overrides for already published cards.
-- This table stores only the latest artwork URL. Neither player inventory nor
-- stable card IDs are touched. Previous versioned files remain in Storage.
create table if not exists public.flip_artwork_overrides (
 card_id text primary key references public.flip_cards(id) on delete restrict,
 public_url text not null
  check(public_url ~ '^https://sodhvekjhlmbhnrkmkzb[.]supabase[.]co/storage/v1/object/public/flip-artwork/[a-z0-9/_-]+[.]webp$'),
 updated_by uuid references auth.users(id),
 updated_at timestamptz not null default now()
);
alter table public.flip_artwork_overrides enable row level security;
revoke all on public.flip_artwork_overrides from public, anon, authenticated;
grant select, insert, update on public.flip_artwork_overrides to service_role;
-- The existing read-only catalogue RPC is served by the game backend.
-- Prefer a reviewed, versioned override over the initial published variant.
create or replace function public.flip_public_catalog()
returns jsonb
language sql
stable
set search_path = ''
as $function$
 select jsonb_build_object(
 'artists',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'active',active)
     order by name) from public.flip_artists),'[]'::jsonb),
 'releases',coalesce((select jsonb_agg(jsonb_build_object('artist_id',artist_id,'id',id,
     'title',title,'year',release_year,'active',active) order by artist_id,title)
     from public.flip_releases),'[]'::jsonb),
 'cards',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'artist_id',c.artist_id,
      'release_id',c.release_id,'rarity',c.rarity,'active',c.active,
      'art_url',coalesce(o.public_url,v.public_url))
     order by c.id)
     from public.flip_cards c
     left join public.flip_artwork_overrides o on o.card_id=c.id
     left join public.flip_studio_artists sa on sa.slug=c.artist_id
     left join public.flip_studio_releases sr on sr.artist_id=sa.id
       and sr.slug=c.release_id and sr.status='published'
     left join public.flip_studio_variants v on v.release_id=sr.id and v.rarity=c.rarity),
     '[]'::jsonb)
 );
$function$;
