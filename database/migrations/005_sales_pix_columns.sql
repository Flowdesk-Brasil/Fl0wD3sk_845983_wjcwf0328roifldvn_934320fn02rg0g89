ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS pix_code text;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS pix_qr_base64 text;
