import { supabase } from './supabase';

export async function getStudents() {
  const { data, error } = await supabase.from('students').select('*').order('created_at', { ascending: false });
  if (error) { console.error('Error fetching students:', error); return []; }
  return data || [];
}

export async function getStudentById(id: string) {
  const { data, error } = await supabase.from('students').select('*').eq('id', id).single();
  return data || null;
}

export async function getPlans() {
  const { data, error } = await supabase.from('plans').select('*').order('price', { ascending: true });
  if (error) { console.error('Error fetching plans:', error); return []; }
  return data || [];
}

export async function getEnrollments() {
  const { data, error } = await supabase
    .from('enrollments')
    .select(`*, student:students(full_name), plan:plans(name, color)`)
    .order('created_at', { ascending: false });
  if (error) { console.error('Error fetching enrollments:', error); return []; }
  return data || [];
}

export async function getPayments() {
  const { data, error } = await supabase
    .from('payments')
    .select(`*, student:students(full_name)`)
    .order('due_date', { ascending: false });
  if (error) { console.error('Error fetching payments:', error); return []; }
  return data || [];
}

export async function getCheckins() {
  const { data, error } = await supabase
    .from('checkins')
    .select(`*, student:students(full_name)`)
    .order('checked_at', { ascending: false })
    .limit(50);
  if (error) { console.error('Error fetching checkins:', error); return []; }
  return data || [];
}

export async function getDashboardStats() {
  // Em um ambiente real, você pode fazer uma query RPC ou usar views no Supabase
  // Aqui faremos múltiplas chamadas simplificadas
  const [
    { count: totalStudents },
    { count: activeStudents },
    { data: payments },
    { count: checkinsToday }
  ] = await Promise.all([
    supabase.from('students').select('*', { count: 'exact', head: true }),
    supabase.from('students').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('payments').select('total_amount').eq('status', 'paid'), // Receita
    supabase.from('checkins').select('*', { count: 'exact', head: true }).gte('checked_at', new Date().toISOString().split('T')[0])
  ]);

  const monthlyRevenue = payments?.reduce((acc, curr) => acc + Number(curr.total_amount), 0) || 0;

  return {
    totalStudents: totalStudents || 0,
    activeStudents: activeStudents || 0,
    monthlyRevenue,
    todayCheckins: checkinsToday || 0,
    activeEnrollments: activeStudents || 0, // simplificação
    pendingPayments: 0,
    overduePayments: 0,
    annualRevenue: monthlyRevenue * 12 // projecao simplificada
  };
}
