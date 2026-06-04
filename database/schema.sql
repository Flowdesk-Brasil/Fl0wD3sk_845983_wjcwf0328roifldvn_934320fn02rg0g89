-- =================================================================================
-- STUDIO CORPO E EVOLUÇÃO - SUPABASE SCHEMA (POSTGRESQL)
-- =================================================================================

-- 1. EXTENSÕES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TIPOS CUSTOMIZADOS (ENUMS)
CREATE TYPE user_role AS ENUM ('admin', 'receptionist', 'professor', 'student');
CREATE TYPE student_status AS ENUM ('active', 'inactive', 'blocked');
CREATE TYPE enrollment_status AS ENUM ('active', 'suspended', 'cancelled', 'expired');
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'expired', 'cancelled', 'refunded');
CREATE TYPE payment_method AS ENUM ('pix', 'credit_card', 'debit_card', 'cash');
CREATE TYPE checkin_status AS ENUM ('allowed', 'denied');

-- =================================================================================
-- 3. TABELAS
-- =================================================================================

-- PROFILES (Estende a tabela auth.users do Supabase)
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role user_role NOT NULL DEFAULT 'student',
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- PLANS (Planos da academia)
CREATE TABLE plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    duration_days INTEGER NOT NULL,
    weekly_limit INTEGER NOT NULL DEFAULT 7,
    color VARCHAR(20) DEFAULT '#820ad1',
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- STUDENTS (Alunos)
CREATE TABLE students (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL, -- Se tiver login no app
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    cpf VARCHAR(14) UNIQUE NOT NULL,
    rg VARCHAR(20),
    birth_date DATE NOT NULL,
    gender VARCHAR(20),
    phone VARCHAR(20) NOT NULL,
    whatsapp VARCHAR(20),
    
    -- Endereço
    cep VARCHAR(10),
    street VARCHAR(255),
    number VARCHAR(20),
    complement VARCHAR(100),
    neighborhood VARCHAR(100),
    city VARCHAR(100),
    state VARCHAR(2),
    
    -- Dados Físicos
    weight DECIMAL(5, 2),
    height DECIMAL(5, 2),
    imc DECIMAL(5, 2),
    objective TEXT,
    
    -- Emergência e Outros
    emergency_contact VARCHAR(255),
    emergency_phone VARCHAR(20),
    observations TEXT,
    
    status student_status DEFAULT 'active',
    qr_code VARCHAR(255) UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- ENROLLMENTS (Matrículas)
CREATE TABLE enrollments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    matricula_number VARCHAR(20) UNIQUE NOT NULL,
    student_id UUID REFERENCES students(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES plans(id) ON DELETE RESTRICT,
    status enrollment_status DEFAULT 'active',
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- CONTRACTS (Contratos)
CREATE TABLE contracts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID REFERENCES students(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES plans(id) ON DELETE RESTRICT,
    enrollment_id UUID REFERENCES enrollments(id) ON DELETE CASCADE,
    document_text TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending', -- pending, signed
    ip_address VARCHAR(50),
    signed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- PAYMENTS (Pagamentos)
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reference VARCHAR(50) UNIQUE NOT NULL,
    student_id UUID REFERENCES students(id) ON DELETE CASCADE,
    enrollment_id UUID REFERENCES enrollments(id) ON DELETE CASCADE,
    
    amount DECIMAL(10, 2) NOT NULL,
    discount DECIMAL(10, 2) DEFAULT 0,
    fine DECIMAL(10, 2) DEFAULT 0,
    total_amount DECIMAL(10, 2) NOT NULL,
    
    status payment_status DEFAULT 'pending',
    method payment_method,
    
    due_date DATE NOT NULL,
    paid_at TIMESTAMP WITH TIME ZONE,
    
    pix_code TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- CHECKINS (Controle de Acesso)
CREATE TABLE checkins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID REFERENCES students(id) ON DELETE CASCADE,
    enrollment_id UUID REFERENCES enrollments(id) ON DELETE SET NULL,
    status checkin_status NOT NULL,
    reason VARCHAR(255),
    unit VARCHAR(100) DEFAULT 'Matriz',
    checked_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- NOTIFICATIONS (Comunicados)
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    target_type VARCHAR(20) NOT NULL, -- 'all', 'student'
    target_id UUID REFERENCES students(id) ON DELETE CASCADE, -- null if all
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- AUDIT_LOGS (Auditoria)
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    entity VARCHAR(50) NOT NULL,
    entity_id UUID,
    details TEXT,
    ip_address VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- =================================================================================
-- 4. FUNÇÕES E TRIGGERS
-- =================================================================================

-- Calcula o IMC automaticamente antes de salvar o aluno
CREATE OR REPLACE FUNCTION calculate_imc()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.weight IS NOT NULL AND NEW.height IS NOT NULL AND NEW.height > 0 THEN
        -- assumindo altura em cm, converte para metros (NEW.height / 100.0)
        NEW.imc := NEW.weight / ((NEW.height / 100.0) * (NEW.height / 100.0));
    ELSE
        NEW.imc := NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_imc_trigger
BEFORE INSERT OR UPDATE ON students
FOR EACH ROW
EXECUTE FUNCTION calculate_imc();

-- Cria um QR Code único para o aluno
CREATE OR REPLACE FUNCTION generate_student_qr()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.qr_code IS NULL THEN
        NEW.qr_code := 'QR-' || SUBSTRING(NEW.id::text FROM 1 FOR 8) || '-' || FLOOR(RANDOM() * 10000)::text;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER generate_student_qr_trigger
BEFORE INSERT ON students
FOR EACH ROW
EXECUTE FUNCTION generate_student_qr();

-- =================================================================================
-- 5. SEGURANÇA (RLS - ROW LEVEL SECURITY)
-- =================================================================================

-- Por padrão, os admins têm acesso total a tudo.
-- Configuração de RLS pode ser expandida no Supabase Studio.

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkins ENABLE ROW LEVEL SECURITY;

-- Políticas básicas (Exemplo: todos os usuários autenticados podem ler os planos)
CREATE POLICY "Planos visíveis para todos os usuários logados" ON plans FOR SELECT USING (auth.role() = 'authenticated');
-- (Adicione políticas RLS detalhadas de acordo com o nível de segurança exigido)
