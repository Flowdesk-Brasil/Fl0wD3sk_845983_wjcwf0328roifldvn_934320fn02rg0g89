import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { supabase } from '@/lib/supabase';

webpush.setVapidDetails(
  'mailto:contato@studio.com.br',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '',
  process.env.VAPID_PRIVATE_KEY || ''
);

export async function POST(req: Request) {
  try {
    const { student_ids, title, body, url } = await req.json();

    if (!student_ids || !student_ids.length) {
      return NextResponse.json({ error: 'Nenhum aluno especificado' }, { status: 400 });
    }

    // Fetch subscriptions
    const { data: subs, error } = await supabase
      .from('push_subscriptions')
      .select('*')
      .in('user_id', student_ids);

    if (error) {
      return NextResponse.json({ error: 'Erro ao buscar inscrições' }, { status: 500 });
    }

    if (!subs || subs.length === 0) {
      return NextResponse.json({ message: 'Nenhuma inscrição encontrada para os alunos' }, { status: 200 });
    }

    const payload = JSON.stringify({
      title: title || 'Corpo & Evolução',
      body: body || 'Nova mensagem',
      url: url || '/mobile-app',
      icon: '/icon-192x192.png' // Make sure you have this icon in public/
    });

    const sendPromises = subs.map(sub => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth
        }
      };

      return webpush.sendNotification(pushSubscription, payload).catch(err => {
        if (err.statusCode === 404 || err.statusCode === 410) {
          // Subscription has expired or is no longer valid, we should delete it
          return supabase.from('push_subscriptions').delete().eq('id', sub.id);
        } else {
          console.error('Subscription error:', err);
        }
      });
    });

    await Promise.all(sendPromises);

    return NextResponse.json({ success: true, sent: subs.length });
  } catch (error) {
    console.error("Error sending push:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
