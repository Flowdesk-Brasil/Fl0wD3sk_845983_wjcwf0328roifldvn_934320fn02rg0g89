-- ==========================================
-- FINAL BOSS MIGRATION: SECURITY & ROBUSTNESS
-- ==========================================
-- Este script alinha o banco de dados para a versão final de produção (Studio Corpo e Evolução).
-- Ele garante que todas as colunas necessárias existam, que as permissões estejam corretas
-- e que os buckets de storage estejam devidamente configurados para a biometria facial.

-- 1. ADICIONAR COLUNAS FALTANTES (Safeguard)
-- Garante que a coluna photo_url exista, caso queiramos armazenar a URL explícita futuramente.
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS observations TEXT;

-- 2. BUCKETS DE STORAGE
-- Criação do Bucket de Fotos de Alunos para Reconhecimento Facial
INSERT INTO storage.buckets (id, name, public, avif_autodetection, file_size_limit, allowed_mime_types) 
VALUES (
  'student-photos', 
  'student-photos', 
  true, 
  false, 
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET 
  public = true,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[];

-- 3. POLÍTICAS DE SEGURANÇA (RLS) PARA STORAGE
-- Permitir leitura pública das fotos (necessário para mostrar na dashboard)
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access" ON storage.objects
  FOR SELECT USING (bucket_id = 'student-photos');

-- Permitir inserção/atualização apenas para usuários autenticados ou anônimos (simplificado para o MVP do Studio)
DROP POLICY IF EXISTS "Public Uploads" ON storage.objects;
CREATE POLICY "Public Uploads" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'student-photos');

DROP POLICY IF EXISTS "Public Updates" ON storage.objects;
CREATE POLICY "Public Updates" ON storage.objects
  FOR UPDATE USING (bucket_id = 'student-photos');

-- 4. OTIMIZAÇÃO DE BUSCA (Índices para performance na Dashboard)
-- Cria índices para acelerar buscas frequentes, essencial para o sistema em produção
CREATE INDEX IF NOT EXISTS idx_students_status ON public.students(status);
CREATE INDEX IF NOT EXISTS idx_enrollments_status ON public.enrollments(status);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_due_date ON public.payments(due_date);
CREATE INDEX IF NOT EXISTS idx_checkins_student ON public.checkins(student_id);
CREATE INDEX IF NOT EXISTS idx_checkins_date ON public.checkins(checked_at DESC);

-- ==========================================
-- FIM DA MIGRAÇÃO
-- ==========================================
