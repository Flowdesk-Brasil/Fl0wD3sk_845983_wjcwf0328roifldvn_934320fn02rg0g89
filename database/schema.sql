-- ============================================================
-- BANCO DE DADOS - Studio Corpo e Evolução
-- Sistema SaaS de Gestão de Academia
-- ============================================================

-- ROLES
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO roles (name, description) VALUES
('admin', 'Administrador com acesso total ao sistema'),
('receptionist', 'Recepcionista com acesso a cadastros e check-in'),
('professor', 'Professor com acesso a alunos e frequência'),
('student', 'Aluno com acesso ao aplicativo móvel');

-- USERS
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role_id INTEGER REFERENCES roles(id),
    avatar_url TEXT,
    active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP,
    reset_token VARCHAR(255),
    reset_token_expires TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ACCESS LOGS
CREATE TABLE access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- STUDENTS
CREATE TABLE students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Dados Pessoais
    full_name VARCHAR(255) NOT NULL,
    birth_date DATE NOT NULL,
    gender CHAR(1) CHECK (gender IN ('M', 'F', 'O')),
    cpf VARCHAR(14) UNIQUE NOT NULL,
    rg VARCHAR(20),
    phone VARCHAR(20),
    whatsapp VARCHAR(20),
    email VARCHAR(255),
    -- Endereço
    cep VARCHAR(10),
    street VARCHAR(255),
    number VARCHAR(20),
    complement VARCHAR(100),
    neighborhood VARCHAR(100),
    city VARCHAR(100),
    state CHAR(2),
    -- Dados Físicos
    weight DECIMAL(5,2),
    height INTEGER,
    imc DECIMAL(4,1),
    objective TEXT,
    -- Status
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'blocked')),
    -- QR Code
    qr_code VARCHAR(100) UNIQUE NOT NULL,
    -- Metadados
    emergency_contact VARCHAR(255),
    emergency_phone VARCHAR(20),
    observations TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- STUDENT DOCUMENTS
CREATE TABLE student_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES students(id) ON DELETE CASCADE,
    document_type VARCHAR(50) NOT NULL,
    file_url TEXT NOT NULL,
    file_name VARCHAR(255),
    file_size INTEGER,
    uploaded_at TIMESTAMP DEFAULT NOW(),
    uploaded_by UUID REFERENCES users(id)
);

-- PLANS
CREATE TABLE plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    description TEXT,
    duration_days INTEGER NOT NULL DEFAULT 30,
    weekly_limit INTEGER DEFAULT 5,
    allowed_hours JSONB DEFAULT '[]',
    color VARCHAR(7) DEFAULT '#6c47ff',
    active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ENROLLMENTS (MATRÍCULAS)
CREATE TABLE enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES students(id),
    plan_id UUID REFERENCES plans(id),
    matricula_number VARCHAR(50) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'cancelled', 'expired')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ENROLLMENT HISTORY
CREATE TABLE enrollment_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id UUID REFERENCES enrollments(id) ON DELETE CASCADE,
    previous_status VARCHAR(20),
    new_status VARCHAR(20) NOT NULL,
    reason TEXT,
    changed_by UUID REFERENCES users(id),
    changed_at TIMESTAMP DEFAULT NOW()
);

-- CONTRACTS
CREATE TABLE contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id UUID REFERENCES enrollments(id),
    student_id UUID REFERENCES students(id),
    plan_id UUID REFERENCES plans(id),
    template_content TEXT NOT NULL,
    processed_content TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'signed', 'cancelled')),
    pdf_url TEXT,
    sent_to_email BOOLEAN DEFAULT FALSE,
    sent_at TIMESTAMP,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- CONTRACT SIGNATURES
CREATE TABLE contract_signatures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID REFERENCES contracts(id) ON DELETE CASCADE,
    signature_type VARCHAR(20) CHECK (signature_type IN ('electronic', 'drawn', 'digital')),
    signature_data TEXT,
    ip_address VARCHAR(50) NOT NULL,
    user_agent TEXT,
    signed_at TIMESTAMP DEFAULT NOW(),
    signer_name VARCHAR(255) NOT NULL,
    signer_cpf VARCHAR(14) NOT NULL
);

-- PAYMENTS
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id UUID REFERENCES enrollments(id),
    student_id UUID REFERENCES students(id),
    amount DECIMAL(10,2) NOT NULL,
    discount DECIMAL(10,2) DEFAULT 0,
    fine DECIMAL(10,2) DEFAULT 0,
    total_amount DECIMAL(10,2) NOT NULL,
    method VARCHAR(20) CHECK (method IN ('pix', 'credit_card', 'debit_card', 'cash')),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired', 'cancelled', 'refunded')),
    due_date DATE NOT NULL,
    paid_at TIMESTAMP,
    pix_qr_code TEXT,
    pix_code TEXT,
    reference VARCHAR(100) UNIQUE NOT NULL,
    notes TEXT,
    approved_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- PAYMENT TRANSACTIONS
CREATE TABLE payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID REFERENCES payments(id) ON DELETE CASCADE,
    gateway VARCHAR(50),
    gateway_transaction_id VARCHAR(255),
    amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) NOT NULL,
    response_data JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- CHECK-INS
CREATE TABLE checkins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES students(id),
    enrollment_id UUID REFERENCES enrollments(id),
    checked_at TIMESTAMP DEFAULT NOW(),
    unit VARCHAR(100) DEFAULT 'Unidade Central',
    receptionist_id UUID REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'allowed' CHECK (status IN ('allowed', 'denied')),
    denied_reason TEXT
);

-- NOTIFICATIONS
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_id UUID,
    target_type VARCHAR(20) CHECK (target_type IN ('student', 'all')),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    read BOOLEAN DEFAULT FALSE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- AUDIT LOGS
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    user_name VARCHAR(255),
    action VARCHAR(50) NOT NULL,
    entity VARCHAR(100) NOT NULL,
    entity_id UUID,
    details TEXT,
    ip_address VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- ÍNDICES
-- ============================================================

CREATE INDEX idx_students_cpf ON students(cpf);
CREATE INDEX idx_students_email ON students(email);
CREATE INDEX idx_students_status ON students(status);
CREATE INDEX idx_students_qr_code ON students(qr_code);
CREATE INDEX idx_enrollments_student_id ON enrollments(student_id);
CREATE INDEX idx_enrollments_status ON enrollments(status);
CREATE INDEX idx_enrollments_matricula ON enrollments(matricula_number);
CREATE INDEX idx_payments_student_id ON payments(student_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_due_date ON payments(due_date);
CREATE INDEX idx_checkins_student_id ON checkins(student_id);
CREATE INDEX idx_checkins_checked_at ON checkins(checked_at);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_notifications_target_id ON notifications(target_id);

-- ============================================================
-- FUNÇÕES E TRIGGERS
-- ============================================================

-- Atualiza updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_students_updated_at BEFORE UPDATE ON students FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_enrollments_updated_at BEFORE UPDATE ON enrollments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_contracts_updated_at BEFORE UPDATE ON contracts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Calcula IMC automaticamente
CREATE OR REPLACE FUNCTION calculate_imc()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.weight IS NOT NULL AND NEW.height IS NOT NULL AND NEW.height > 0 THEN
        NEW.imc = NEW.weight / POWER(NEW.height::DECIMAL / 100, 2);
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER calculate_student_imc BEFORE INSERT OR UPDATE ON students FOR EACH ROW EXECUTE FUNCTION calculate_imc();

-- Gera número de matrícula automaticamente
CREATE OR REPLACE FUNCTION generate_matricula_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.matricula_number IS NULL OR NEW.matricula_number = '' THEN
        NEW.matricula_number = 'MAT-' || EXTRACT(YEAR FROM NOW()) || '-' || LPAD(nextval('matricula_seq')::TEXT, 5, '0');
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE SEQUENCE matricula_seq START 10001;
CREATE TRIGGER generate_enrollment_matricula BEFORE INSERT ON enrollments FOR EACH ROW EXECUTE FUNCTION generate_matricula_number();

-- Registra histórico de mudança de status da matrícula
CREATE OR REPLACE FUNCTION log_enrollment_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status <> NEW.status THEN
        INSERT INTO enrollment_history (enrollment_id, previous_status, new_status, changed_at)
        VALUES (NEW.id, OLD.status, NEW.status, NOW());
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER log_enrollment_status AFTER UPDATE ON enrollments FOR EACH ROW EXECUTE FUNCTION log_enrollment_status_change();
