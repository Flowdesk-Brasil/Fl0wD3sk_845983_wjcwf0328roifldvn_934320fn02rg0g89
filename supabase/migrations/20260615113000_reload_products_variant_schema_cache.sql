alter table public.products add column if not exists parent_product_id uuid references public.products(id) on delete cascade;
alter table public.products add column if not exists variant_color text;
alter table public.products add column if not exists variant_size text;
alter table public.products add column if not exists variant_label text;
alter table public.products add column if not exists primary_barcode text;

create index if not exists idx_products_parent_product_id
  on public.products(parent_product_id);

create index if not exists idx_products_primary_barcode
  on public.products(primary_barcode);

update public.products
set primary_barcode = coalesce(primary_barcode, barcode, sku, internal_code)
where primary_barcode is null;

notify pgrst, 'reload schema';
