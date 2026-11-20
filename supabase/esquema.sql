-- Migración: crear_tabla_productos
-- Tabla productos (docs/diseno.md §3)
create table public.productos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid()
              references auth.users (id) on delete cascade,
  nombre      text not null check (char_length(btrim(nombre)) between 1 and 100),
  sku         text not null check (char_length(sku) between 1 and 50 and sku = btrim(sku)),
  cantidad    integer not null default 0 check (cantidad >= 0),
  minimo      integer not null default 0 check (minimo >= 0),
  created_at  timestamptz not null default now()
);

-- SKU único por usuario sin distinguir mayúsculas (HU2.4, HU2.5, HU5.2).
-- Empieza por user_id, así que también sirve de índice para las políticas RLS.
create unique index productos_user_sku_unico
  on public.productos (user_id, lower(sku));

-- Row Level Security: cada usuario solo ve y modifica sus propios productos
ALTER TABLE public.productos
  ENABLE ROW LEVEL SECURITY;

create policy "ver propios" on public.productos
  for select to authenticated
  using ( (select auth.uid()) = user_id );

create policy "crear propios" on public.productos
  for insert to authenticated
  with check ( (select auth.uid()) = user_id );

create policy "editar propios" on public.productos
  for update to authenticated
  using ( (select auth.uid()) = user_id )
  with check ( (select auth.uid()) = user_id );

create policy "eliminar propios" on public.productos
  for delete to authenticated
  using ( (select auth.uid()) = user_id );

-- Permisos de la Data API: se quitan todos y se conceden solo a authenticated
REVOKE ALL ON TABLE public.productos
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.productos TO authenticated;
