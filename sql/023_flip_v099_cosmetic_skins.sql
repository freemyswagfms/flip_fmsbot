-- FLIP v0.9.9 — four curated paid cosmetics; no schema or existing ownership changes.
INSERT INTO public.flip_cosmetic_catalog
 (id,kind,name,price,active,sort_order) VALUES
 ('lunar-haze','background','LUNAR HAZE',500,true,5),
 ('prism-shift','background','PRISM SHIFT',650,true,6),
 ('midnight-vault','showcase_skin','MIDNIGHT VAULT',600,true,25),
 ('prism-chamber','showcase_skin','PRISM CHAMBER',800,true,26)
ON CONFLICT (id) DO UPDATE SET
 kind=EXCLUDED.kind,name=EXCLUDED.name,price=EXCLUDED.price,
 active=true,sort_order=EXCLUDED.sort_order;
