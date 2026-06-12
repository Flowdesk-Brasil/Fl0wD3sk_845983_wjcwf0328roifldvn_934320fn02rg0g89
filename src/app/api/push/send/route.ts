import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { getAdminClient } from '@/lib/server/supabase-admin';

webpush.setVapidDetails(
  'mailto:contato@studio.com.br',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || 'BE8FMu1NZtQh2QVULUShurqQlruZMOECnnw2HuHmx2X63Iv0jxuDLquhVva4lERZmuMsUE5OjzKRbWi1As0ZQlY',
  process.env.VAPID_PRIVATE_KEY || '3dO0XqBl8t69E1VevHLFlubTtixtEJeexYoXu4-7MLQ'
);

export async function POST(req: Request) {
  try {
    const { student_ids, title, body, url } = await req.json();

    if (!student_ids || !student_ids.length) {
      return NextResponse.json({ error: 'Nenhum aluno especificado' }, { status: 400 });
    }

    // Use admin client to bypass RLS when fetching push subscriptions
    const admin = getAdminClient();
    const { data: subs, error } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .in('user_id', student_ids);

    if (error) {
      return NextResponse.json({ error: 'Erro ao buscar inscrições: ' + error.message }, { status: 500 });
    }

    if (!subs || subs.length === 0) {
      return NextResponse.json({ message: 'Nenhuma inscrição push encontrada para os alunos.', sent: 0 }, { status: 200 });
    }

    const payload = JSON.stringify({
      title: title || 'Corpo & Evolução',
      body: body || 'Nova mensagem',
      url: url || '/portal',
      icon: '/icon-192x192.png',
    });

    let sent = 0;
    const deleteIds: string[] = [];

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          );
          sent++;
        } catch (err: any) {
          if (err.statusCode === 404 || err.statusCode === 410) {
            deleteIds.push(sub.id);
          } else {
            console.error('Subscription error:', err?.message || err);
          }
        }
      })
    );

    // Cleanup expired subscriptions
    if (deleteIds.length > 0) {
      await admin.from('push_subscriptions').delete().in('id', deleteIds);
    }

    return NextResponse.json({ success: true, sent, expired: deleteIds.length });
  } catch (error: any) {
    console.error('Error sending push:', error);
    return NextResponse.json({ error: 'Internal Server Error: ' + (error?.message || error) }, { status: 500 });
  }
}
