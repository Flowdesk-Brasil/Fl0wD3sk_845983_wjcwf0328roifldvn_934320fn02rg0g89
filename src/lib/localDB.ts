"use client";

// Banco de dados local na memória/localStorage para funcionar 100% sem Supabase configurado
const isBrowser = typeof window !== 'undefined';

const getStore = (key: string) => {
  if (!isBrowser) return [];
  const item = localStorage.getItem(`db_${key}`);
  return item ? JSON.parse(item) : [];
};

const setStore = (key: string, data: any) => {
  if (isBrowser) localStorage.setItem(`db_${key}`, JSON.stringify(data));
};

// Seed Inicial
export const initLocalDB = () => {
  if (!isBrowser) return;
  if (!localStorage.getItem('db_profiles')) {
    setStore('profiles', [
      { id: '1', email: 'admin@admin.com', password: 'admin', full_name: 'Admin Senior', role: 'admin', created_at: new Date().toISOString() }
    ]);
  }
  if (!localStorage.getItem('db_students')) setStore('students', []);
  if (!localStorage.getItem('db_plans')) {
    setStore('plans', [
      { id: 'p1', name: 'Plano Mensal', price: 100, duration_days: 30, color: '#ffffff', active: true },
      { id: 'p2', name: 'Plano Anual', price: 900, duration_days: 365, color: '#820ad1', active: true }
    ]);
  }
  if (!localStorage.getItem('db_enrollments')) setStore('enrollments', []);
  if (!localStorage.getItem('db_payments')) setStore('payments', []);
  if (!localStorage.getItem('db_checkins')) setStore('checkins', []);
  if (!localStorage.getItem('db_audit_logs')) setStore('audit_logs', []);
};

export const localDB = {
  get: (table: string) => getStore(table),
  insert: (table: string, data: any) => {
    const store = getStore(table);
    const newItem = { id: Math.random().toString(36).substr(2, 9), created_at: new Date().toISOString(), ...data };
    store.push(newItem);
    setStore(table, store);
    
    // Log de auditoria automático
    if (table !== 'audit_logs') {
      const user = isBrowser ? JSON.parse(localStorage.getItem('currentUser') || '{}') : {};
      const logs = getStore('audit_logs');
      logs.push({
        id: Math.random().toString(36).substr(2, 9),
        created_at: new Date().toISOString(),
        action: 'CREATE',
        entity: table,
        details: `Criou registro em ${table}`,
        profiles: { full_name: user.full_name || 'Sistema' }
      });
      setStore('audit_logs', logs);
    }
    
    return newItem;
  },
  update: (table: string, id: string, data: any) => {
    const store = getStore(table);
    const index = store.findIndex((i:any) => i.id === id);
    if (index > -1) {
      store[index] = { ...store[index], ...data, updated_at: new Date().toISOString() };
      setStore(table, store);
    }
    return store[index];
  },
  delete: (table: string, id: string) => {
    const store = getStore(table);
    setStore(table, store.filter((i:any) => i.id !== id));
  }
};

initLocalDB();
