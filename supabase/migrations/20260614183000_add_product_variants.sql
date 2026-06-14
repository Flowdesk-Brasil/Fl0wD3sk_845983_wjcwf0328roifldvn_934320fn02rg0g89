alter table products add column if not exists parent_product_id uuid references products(id) on delete cascade;
alter table products add column if not exists variant_color text;
alter table products add column if not exists variant_size text;
alter table products add column if not exists variant_label text;
alter table products add column if not exists primary_barcode text;

create index if not exists idx_products_parent_product_id
  on products(parent_product_id);

create index if not exists idx_products_primary_barcode
  on products(primary_barcode);

update products
set primary_barcode = coalesce(primary_barcode, barcode, sku, internal_code)
where primary_barcode is null;
