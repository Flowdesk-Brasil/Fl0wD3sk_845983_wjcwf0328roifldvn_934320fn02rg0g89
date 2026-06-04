import { supabase } from './supabase';
import { localDB } from './localDB';

const isDummy = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("dummy.supabase.co");

export async function getStudents() {
  if (isDummy) return localDB.get('students').sort((a:any, b:any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const { data, error } = await supabase.from('students').select('*').order('created_at', { ascending: false });
  if (error) { console.error('Error fetching students:', error); return []; }
  return data || [];
}

export async function getStudentById(id: string) {
  if (isDummy) return localDB.get('students').find((s:any) => s.id === id) || null;
  const { data, error } = await supabase.from('students').select('*').eq('id', id).single();
  return data || null;
}

export async function getPlans() {
  if (isDummy) return localDB.get('plans').sort((a:any, b:any) => a.price - b.price);
  const { data, error } = await supabase.from('plans').select('*').order('price', { ascending: true });
  if (error) { console.error('Error fetching plans:', error); return []; }
  return data || [];
}

export async function getEnrollments() {
  if (isDummy) return localDB.get('enrollments');
  const { data, error } = await supabase
    .from('enrollments')
    .select(`*, student:students(full_name), plan:plans(name, color)`)
    .order('created_at', { ascending: false });
  if (error) { console.error('Error fetching enrollments:', error); return []; }
  return data || [];
}

export async function getPayments() {
  if (isDummy) return localDB.get('payments');
  const { data, error } = await supabase
    .from('payments')
    .select(`*, student:students(full_name)`)
    .order('due_date', { ascending: false });
  if (error) { console.error('Error fetching payments:', error); return []; }
  return data || [];
}

export async function getCheckins() {
  if (isDummy) return localDB.get('checkins');
  const { data, error } = await supabase
    .from('checkins')
    .select(`*, student:students(full_name)`)
    .order('checked_at', { ascending: false })
    .limit(50);
  if (error) { console.error('Error fetching checkins:', error); return []; }
  return data || [];
}

export async function getDashboardStats() {
  if (isDummy) {
    const students = localDB.get('students');
    const payments = localDB.get('payments');
    const checkins = localDB.get('checkins');
    return {
      totalStudents: students.length,
      activeStudents: students.filter((s:any) => s.status === 'active').length,
      monthlyRevenue: payments.filter((p:any) => p.status === 'paid').reduce((a:any, b:any) => a + Number(b.total_amount), 0),
      todayCheckins: checkins.length,
      activeEnrollments: students.length,
      pendingPayments: payments.filter((p:any) => p.status === 'pending').length,
      overduePayments: 0,
      annualRevenue: 0
    };
  }

  // Supabase Code...
  const [
    { count: totalStudents },
    { count: activeStudents },
    { data: payments },
    { count: checkinsToday }
  ] = await Promise.all([
    supabase.from('students').select('*', { count: 'exact', head: true }),
    supabase.from('students').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('payments').select('total_amount').eq('status', 'paid'),
    supabase.from('checkins').select('*', { count: 'exact', head: true }).gte('checked_at', new Date().toISOString().split('T')[0])
  ]);

  const monthlyRevenue = payments?.reduce((acc, curr) => acc + Number(curr.total_amount), 0) || 0;

  return {
    totalStudents: totalStudents || 0,
    activeStudents: activeStudents || 0,
    monthlyRevenue,
    todayCheckins: checkinsToday || 0,
    activeEnrollments: activeStudents || 0,
    pendingPayments: 0,
    overduePayments: 0,
    annualRevenue: monthlyRevenue * 12
  };
}
