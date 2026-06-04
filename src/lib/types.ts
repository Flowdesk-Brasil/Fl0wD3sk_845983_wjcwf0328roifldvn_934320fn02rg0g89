export type UserRole = "admin" | "receptionist" | "professor" | "student";
export type StudentStatus = "active" | "inactive" | "blocked";
export type EnrollmentStatus = "active" | "suspended" | "cancelled" | "expired";
export type PaymentStatus = "pending" | "paid" | "expired" | "cancelled" | "refunded";
export type PaymentMethod = "pix" | "credit_card" | "debit_card" | "cash";
export type CheckinStatus = "allowed" | "denied";

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  active: boolean;
  created_at: string;
  last_login?: string | null;
  password?: string;
}

export interface Student {
  id: string;
  profile_id?: string | null;
  full_name: string;
  email?: string | null;
  cpf: string;
  rg?: string | null;
  birth_date: string;
  gender?: string | null;
  phone: string;
  whatsapp?: string | null;
  cep?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  weight?: number | null;
  height?: number | null;
  imc?: number | null;
  objective?: string | null;
  emergency_contact?: string | null;
  emergency_phone?: string | null;
  observations?: string | null;
  status: StudentStatus;
  qr_code: string;
  created_at: string;
  updated_at: string;
}

export interface Plan {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  duration_days: number;
  weekly_limit: number;
  color: string;
  active: boolean;
  created_at: string;
}

export interface Enrollment {
  id: string;
  matricula_number: string;
  student_id: string;
  plan_id: string;
  status: EnrollmentStatus;
  start_date: string;
  end_date: string;
  created_at: string;
  student?: Pick<Student, "id" | "full_name" | "status"> | null;
  plan?: Pick<Plan, "id" | "name" | "color" | "price"> | null;
}

export interface Contract {
  id: string;
  student_id: string;
  plan_id: string;
  enrollment_id: string;
  document_text: string;
  status: "pending" | "signed" | "cancelled";
  ip_address?: string | null;
  signature_data?: string | null;
  signed_at?: string | null;
  sent_at?: string | null;
  created_at: string;
  student?: Pick<Student, "id" | "full_name"> | null;
  plan?: Pick<Plan, "id" | "name"> | null;
}

export interface Payment {
  id: string;
  reference: string;
  student_id: string;
  enrollment_id: string;
  amount: number;
  discount: number;
  fine: number;
  total_amount: number;
  status: PaymentStatus;
  method?: PaymentMethod | null;
  due_date: string;
  paid_at?: string | null;
  pix_code?: string | null;
  pix_qr_base64?: string | null;
  pix_ticket_url?: string | null;
  provider_payment_id?: string | null;
  provider_status?: string | null;
  created_at: string;
  student?: Pick<Student, "id" | "full_name"> | null;
}

export interface Checkin {
  id: string;
  student_id?: string | null;
  enrollment_id?: string | null;
  status: CheckinStatus;
  reason?: string | null;
  unit: string;
  checked_at: string;
  student?: Pick<Student, "id" | "full_name"> | null;
}

export interface Notification {
  id: string;
  target_type: "student" | "all";
  target_id?: string | null;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id?: string | null;
  action: string;
  entity: string;
  entity_id?: string | null;
  details: string;
  ip_address?: string | null;
  created_at: string;
  profiles?: Pick<Profile, "full_name"> | null;
}

export interface StudioSettings {
  id: string;
  studio_name: string;
  cnpj: string;
  phone: string;
  email: string;
  address: string;
  contract_template_path?: string | null;
  contract_template_name?: string | null;
  updated_at: string;
}

export interface ClassType {
  id: string;
  name: string;
  description?: string | null;
  color: string;
  duration_minutes: number;
  capacity: number;
  active: boolean;
  created_at: string;
}

export interface ClassBooking {
  id: string;
  session_id: string;
  student_id: string;
  status: "confirmed" | "attended" | "cancelled" | "missed";
  created_at: string;
  student?: Pick<Student, "id" | "full_name"> | null;
}

export interface ClassSession {
  id: string;
  class_type_id: string;
  instructor_id?: string | null;
  start_at: string;
  end_at: string;
  capacity: number;
  status: "scheduled" | "completed" | "cancelled";
  notes?: string | null;
  created_at: string;
  class_type?: ClassType | null;
  instructor?: Pick<Profile, "id" | "full_name"> | null;
  bookings?: ClassBooking[];
}

export interface DashboardStats {
  totalStudents: number;
  activeStudents: number;
  activeEnrollments: number;
  pendingPayments: number;
  monthlyRevenue: number;
  todayCheckins: number;
  overduePayments: number;
  conversionRate: number;
}

export interface RevenuePoint {
  name: string;
  receita: number;
}

export interface LocalTables {
  profiles: Profile;
  students: Student;
  plans: Plan;
  enrollments: Omit<Enrollment, "student" | "plan">;
  contracts: Omit<Contract, "student" | "plan">;
  payments: Omit<Payment, "student">;
  checkins: Omit<Checkin, "student">;
  notifications: Notification;
  audit_logs: AuditLog;
  settings: StudioSettings;
  class_types: ClassType;
  class_sessions: Omit<ClassSession, "class_type" | "instructor" | "bookings">;
  class_bookings: Omit<ClassBooking, "student">;
}

export type TableName = keyof LocalTables;
export type NewRow<T extends TableName> = Omit<LocalTables[T], "id" | "created_at"> &
  Partial<Pick<LocalTables[T], Extract<keyof LocalTables[T], "id" | "created_at">>>;
