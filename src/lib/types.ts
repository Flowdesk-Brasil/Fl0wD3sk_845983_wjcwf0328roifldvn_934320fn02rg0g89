// ============================================================
// TYPES - Sistema Studio Corpo e Evolução
// ============================================================

export type UserRole = "admin" | "receptionist" | "professor" | "student";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  active: boolean;
  createdAt: string;
  lastLogin?: string;
}

export type StudentStatus = "active" | "inactive" | "blocked";

export interface Student {
  id: string;
  // Dados Pessoais
  fullName: string;
  birthDate: string;
  gender: "M" | "F" | "Other";
  cpf: string;
  rg: string;
  phone: string;
  whatsapp: string;
  email: string;
  // Endereço
  cep: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  // Dados Físicos
  weight?: number;
  height?: number;
  imc?: number;
  objective?: string;
  // Documentos
  photoUrl?: string;
  rgFrontUrl?: string;
  rgBackUrl?: string;
  cpfDocUrl?: string;
  addressProofUrl?: string;
  // Informações Adicionais
  emergencyContact?: string;
  emergencyPhone?: string;
  observations?: string;
  // Status
  status: StudentStatus;
  createdAt: string;
  updatedAt: string;
  // QR Code
  qrCode: string;
}

export type EnrollmentStatus = "active" | "suspended" | "cancelled" | "expired";

export interface Enrollment {
  id: string;
  studentId: string;
  planId: string;
  matriculaNumber: string;
  status: EnrollmentStatus;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
  history: EnrollmentHistory[];
}

export interface EnrollmentHistory {
  id: string;
  enrollmentId: string;
  previousStatus: EnrollmentStatus;
  newStatus: EnrollmentStatus;
  reason?: string;
  changedBy: string;
  changedAt: string;
}

export interface Plan {
  id: string;
  name: string;
  price: number;
  description: string;
  durationDays: number;
  weeklyLimit: number;
  allowedHours: string[];
  active: boolean;
  color: string;
  createdAt: string;
}

export type ContractStatus = "pending" | "signed" | "cancelled";

export interface Contract {
  id: string;
  enrollmentId: string;
  studentId: string;
  planId: string;
  templateContent: string;
  processedContent: string;
  status: ContractStatus;
  pdfUrl?: string;
  sentToEmail: boolean;
  createdAt: string;
  signature?: ContractSignature;
}

export interface ContractSignature {
  id: string;
  contractId: string;
  signatureType: "electronic" | "drawn" | "digital";
  signatureData: string;
  ip: string;
  signedAt: string;
  signerName: string;
  signerCpf: string;
}

export type PaymentStatus = "pending" | "paid" | "expired" | "cancelled" | "refunded";
export type PaymentMethod = "pix" | "credit_card" | "debit_card" | "cash";

export interface Payment {
  id: string;
  enrollmentId: string;
  studentId: string;
  amount: number;
  discount: number;
  fine: number;
  totalAmount: number;
  method?: PaymentMethod;
  status: PaymentStatus;
  dueDate: string;
  paidAt?: string;
  pixQrCode?: string;
  pixCode?: string;
  reference: string;
  notes?: string;
  createdAt: string;
}

export interface CheckIn {
  id: string;
  studentId: string;
  enrollmentId: string;
  checkedAt: string;
  unit: string;
  receptionistId: string;
  receptionistName: string;
  status: "allowed" | "denied";
  deniedReason?: string;
}

export interface Notification {
  id: string;
  targetId: string;
  targetType: "student" | "all";
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  entity: string;
  entityId: string;
  details: string;
  ip: string;
  createdAt: string;
}

export interface DashboardStats {
  totalStudents: number;
  activeStudents: number;
  activeEnrollments: number;
  pendingPayments: number;
  monthlyRevenue: number;
  annualRevenue: number;
  todayCheckins: number;
  overduePayments: number;
}
