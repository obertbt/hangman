import { NextResponse } from 'next/server';

import { buildExportCsv, isExportType } from '@/features/ops/export';
import { exportFilename, withBom } from '@/features/ops/lib/csv';
import { getAppSession } from '@/lib/auth/session';
import { todayInTokyo } from '@/lib/datetime';

/**
 * 記録の書き出し（3章の12: 過去の資産を失わない）。
 *
 * 権限で出し分けない。**RLS が見せてくれたものだけが出る。**
 * 選手が押せば自分のぶん、コーチが押せば見える範囲すべて。
 * ここで独自に絞ると、画面と RLS で規則が二重になって必ずズレる。
 *
 * 未ログインのときは、実際には proxy がログイン画面へ送るのでここまで来ない。
 * それでも下で確かめているのは、proxy の対象から外れても素通りさせないため。
 * 認証を1か所だけに頼らない（75章）。
 */
export async function GET(_request: Request, { params }: { params: Promise<{ type: string }> }) {
  const session = await getAppSession();
  if (!session) {
    return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 });
  }

  const { type } = await params;
  if (!isExportType(type)) {
    return NextResponse.json({ error: 'その種類は書き出せません。' }, { status: 404 });
  }

  const csv = await buildExportCsv(session, type);
  const filename = exportFilename(type, todayInTokyo());

  return new NextResponse(withBom(csv), {
    headers: {
      // Excel は BOM が無いと UTF-8 と判断しない
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      // 個人の記録なので、経路上に残さない
      'Cache-Control': 'no-store',
    },
  });
}
