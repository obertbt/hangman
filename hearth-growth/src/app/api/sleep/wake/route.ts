import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

/**
 * 通知の「起きている」から呼ばれる。
 *
 * サービスワーカーからの同一オリジンの要求なので、
 * ログインの手形（Cookie）がそのまま届く。誰の睡眠かは RLS が決める。
 *
 * アプリを開かせずに終えられることが肝心なので、
 * 画面ではなくこの経路を用意している。
 */
export async function POST() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // 手形が切れている。通知側はアプリを開く動きに切り替える。
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const { data, error } = await supabase.rpc('wake_up');

  if (error) {
    // 「寝ていない」は失敗ではない。すでに起きているだけ。
    if (error.message?.includes('not sleeping')) {
      return NextResponse.json({ ok: true, alreadyAwake: true });
    }
    console.error('wake via notification failed', error);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, postId: data });
}
