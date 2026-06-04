import { createClient } from '@supabase/supabase-js';

// As chaves devem estar no .env.local
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not found. Please add them to .env.local');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
