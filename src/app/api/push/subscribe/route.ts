import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase'; // We'll bypass RLS with service role if needed, or just insert.

export async function POST(req: Request) {
  try {
    const { subscription, student_id } = await req.json();

    if (!subscription || !subscription.endpoint || !student_id) {
      return NextResponse.json({ error: 'Missing subscription or student_id' }, { status: 400 });
    }

    // Upsert subscription
    const { error } = await supabase.from('push_subscriptions').upsert({
      id: subscription.endpoint, // use endpoint as id to avoid duplicates
      user_id: student_id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      created_at: new Date().toISOString()
    });

    if (error) {
      console.error("Error saving subscription:", error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error processing subscription:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
