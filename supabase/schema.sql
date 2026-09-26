create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  username text unique,
  avatar_url text,
  spreadsheet_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kode text not null,
  nama text not null,
  kategori text not null default 'Umum',
  harga numeric(15,2) not null default 0 check (harga >= 0),
  stok integer not null default 0 check (stok >= 0),
  satuan text not null default 'Unit',
  supplier text not null default '',
  deskripsi text not null default '',
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, kode)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  type text not null check (type in ('masuk','keluar')),
  jumlah integer not null check (jumlah > 0),
  keterangan text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists products_user_id_idx on public.products(user_id);
create index if not exists transactions_user_id_idx on public.transactions(user_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at before update on public.products
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'username', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.transactions enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated
using ((select auth.uid()) = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert to authenticated
with check ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "products_select_own" on public.products;
create policy "products_select_own" on public.products for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "products_insert_own" on public.products;
create policy "products_insert_own" on public.products for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "products_update_own" on public.products;
create policy "products_update_own" on public.products for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "products_delete_own" on public.products;
create policy "products_delete_own" on public.products for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "transactions_select_own" on public.transactions;
create policy "transactions_select_own" on public.transactions for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "transactions_insert_own" on public.transactions;
create policy "transactions_insert_own" on public.transactions for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "transactions_delete_own" on public.transactions;
create policy "transactions_delete_own" on public.transactions for delete to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.profiles, public.products, public.transactions from anon;
grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.products to authenticated;
grant select, insert, delete on table public.transactions to authenticated;

insert into storage.buckets (id, name, public)
values ('product-images','product-images',true)
on conflict (id) do update set public=true;

drop policy if exists "product_images_select" on storage.objects;
create policy "product_images_select" on storage.objects for select to public
using (bucket_id = 'product-images');

drop policy if exists "product_images_insert" on storage.objects;
create policy "product_images_insert" on storage.objects for insert to authenticated
with check (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "product_images_update" on storage.objects;
create policy "product_images_update" on storage.objects for update to authenticated
using (bucket_id='product-images' and owner_id=(select auth.uid())::text)
with check (bucket_id='product-images' and owner_id=(select auth.uid())::text);

drop policy if exists "product_images_delete" on storage.objects;
create policy "product_images_delete" on storage.objects for delete to authenticated
using (bucket_id='product-images' and owner_id=(select auth.uid())::text);

-- Atomic stock transaction: updates stock and writes the transaction in one database call.
create or replace function public.record_stock_transaction(
  p_product_id uuid,
  p_type text,
  p_jumlah integer,
  p_keterangan text default ''
)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.products;
  v_transaction public.transactions;
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Anda harus login.';
  end if;
  if p_type not in ('masuk','keluar') then
    raise exception 'Jenis transaksi tidak valid.';
  end if;
  if p_jumlah is null or p_jumlah <= 0 then
    raise exception 'Jumlah transaksi harus lebih dari 0.';
  end if;

  select * into v_product
  from public.products
  where id = p_product_id and user_id = v_user
  for update;

  if not found then
    raise exception 'Barang tidak ditemukan atau bukan milik akun ini.';
  end if;

  if p_type = 'keluar' and v_product.stok < p_jumlah then
    raise exception 'Stok tidak cukup. Stok saat ini: %.', v_product.stok;
  end if;

  update public.products
  set stok = case when p_type = 'masuk' then stok + p_jumlah else stok - p_jumlah end
  where id = p_product_id and user_id = v_user;

  insert into public.transactions(user_id, product_id, type, jumlah, keterangan)
  values(v_user, p_product_id, p_type, p_jumlah, coalesce(p_keterangan,''))
  returning * into v_transaction;

  return v_transaction;
end;
$$;

grant execute on function public.record_stock_transaction(uuid,text,integer,text) to authenticated;
