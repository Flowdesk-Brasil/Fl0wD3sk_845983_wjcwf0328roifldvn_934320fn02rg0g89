-- ==========================================
-- MIGRAÇÃO 004: MÓDULO DE ERP (ESTOQUE, PDV E RECEBIMENTO)
-- ==========================================

-- 1. FORNECEDORES (Suppliers)
CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  corporate_name text NOT NULL,
  trade_name text,
  cnpj text UNIQUE,
  email text,
  phone text,
  address text,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. PRODUTOS (Products - Cadastro Mestre)
CREATE TABLE IF NOT EXISTS public.products (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  variant_color text,
  variant_size text,
  variant_label text,
  primary_barcode text,
  internal_code text UNIQUE,
  barcode text UNIQUE, -- EAN
  sku text UNIQUE,
  name text NOT NULL,
  category text,
  subcategory text,
  brand text,
  unit_measure text DEFAULT 'UN',
  weight numeric(10,3),
  volume numeric(10,3),
  average_cost numeric(10,2) DEFAULT 0,
  current_cost numeric(10,2) DEFAULT 0,
  selling_price numeric(10,2) NOT NULL DEFAULT 0,
  minimum_stock integer DEFAULT 0,
  maximum_stock integer DEFAULT 0,
  current_stock integer DEFAULT 0,
  physical_location text,
  ncm text,
  cfop text,
  cest text,
  active boolean DEFAULT true,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  photo_url text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. RECEBIMENTOS (Receivings / NFe)
CREATE TABLE IF NOT EXISTS public.receivings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_number text,
  invoice_key text UNIQUE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  issue_date date,
  expected_delivery_date date,
  total_amount numeric(10,2) DEFAULT 0,
  total_items integer DEFAULT 0,
  status text NOT NULL DEFAULT 'Aguardando Chegada', -- Aguardando Chegada, Recebido, Em Triagem, Triagem Concluída, Divergência, Finalizado
  observations text,
  xml_url text,
  pdf_url text,
  operator_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. ITENS DO RECEBIMENTO E TRIAGEM (Receiving Items)
CREATE TABLE IF NOT EXISTS public.receiving_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  receiving_id uuid REFERENCES public.receivings(id) ON DELETE CASCADE NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE RESTRICT NOT NULL,
  expected_quantity integer NOT NULL DEFAULT 0,
  checked_quantity integer NOT NULL DEFAULT 0,
  unit_cost numeric(10,2) DEFAULT 0,
  total_cost numeric(10,2) DEFAULT 0,
  status text DEFAULT 'Pendente', -- Pendente, Conferido, Divergente
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. MOVIMENTAÇÕES DE ESTOQUE (Inventory Transactions)
CREATE TABLE IF NOT EXISTS public.inventory_transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid REFERENCES public.products(id) ON DELETE RESTRICT NOT NULL,
  transaction_type text NOT NULL, -- 'IN' (Entrada), 'OUT' (Saída), 'ADJ' (Ajuste)
  quantity integer NOT NULL,
  previous_stock integer NOT NULL,
  new_stock integer NOT NULL,
  reason text, -- Venda, Recebimento, Ajuste Manual, Perda, Vencimento
  reference_id uuid, -- ID da Venda ou do Recebimento
  operator_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. VENDAS PDV (Sales)
CREATE TABLE IF NOT EXISTS public.sales (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL, -- Cliente opcional
  total_amount numeric(10,2) NOT NULL DEFAULT 0,
  discount numeric(10,2) DEFAULT 0,
  final_amount numeric(10,2) NOT NULL DEFAULT 0,
  payment_method text, -- pix, credit_card, debit_card, cash, mixed
  status text DEFAULT 'completed', -- pending, completed, cancelled
  operator_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. ITENS DA VENDA (Sale Items)
CREATE TABLE IF NOT EXISTS public.sale_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id uuid REFERENCES public.sales(id) ON DELETE CASCADE NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE RESTRICT NOT NULL,
  quantity integer NOT NULL,
  unit_price numeric(10,2) NOT NULL,
  total_price numeric(10,2) NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- TRIGGERS PARA ATUALIZAÇÃO DE UPDATED_AT
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now(); 
   RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_suppliers_updated_at ON public.suppliers;
CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_products_updated_at ON public.products;
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_receivings_updated_at ON public.receivings;
CREATE TRIGGER update_receivings_updated_at BEFORE UPDATE ON public.receivings FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- ÍNDICES DE PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_products_barcode ON public.products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products(sku);
CREATE INDEX IF NOT EXISTS idx_products_parent_product_id ON public.products(parent_product_id);
CREATE INDEX IF NOT EXISTS idx_products_primary_barcode ON public.products(primary_barcode);
CREATE INDEX IF NOT EXISTS idx_receivings_status ON public.receivings(status);
CREATE INDEX IF NOT EXISTS idx_inventory_product ON public.inventory_transactions(product_id);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON public.sales(created_at DESC);

-- POLÍTICAS RLS (Liberando acesso total temporário para facilitar o desenvolvimento MVP)
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receivings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receiving_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.suppliers;
CREATE POLICY "Enable all for authenticated users" ON public.suppliers FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.products;
CREATE POLICY "Enable all for authenticated users" ON public.products FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.receivings;
CREATE POLICY "Enable all for authenticated users" ON public.receivings FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.receiving_items;
CREATE POLICY "Enable all for authenticated users" ON public.receiving_items FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.inventory_transactions;
CREATE POLICY "Enable all for authenticated users" ON public.inventory_transactions FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.sales;
CREATE POLICY "Enable all for authenticated users" ON public.sales FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.sale_items;
CREATE POLICY "Enable all for authenticated users" ON public.sale_items FOR ALL USING (auth.role() = 'authenticated');
