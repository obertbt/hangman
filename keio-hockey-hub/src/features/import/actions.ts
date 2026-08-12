'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requirePermission } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/server';
import { createClient } from '@/lib/supabase/server';
import { limits } from '@/lib/env';

import { suggestMapping, type MappingSuggestion, type PlayerField } from './lib/mapping';
import { parseTable } from './lib/parse';
import {
  analyzePlayerRows,
  importableRows,
  type AnalyzedRow,
  type ImportSummary,
  type UpsertMode,
} from './lib/player-import';
import { listExistingMembers } from './queries';

/**
 * Import Center の Server Action（33〜50章）。
 *
 * 守ること:
 *   * 実行できるのは import.execute を持つ人だけ（50章）。
 *   * CSV に team_id が入っていても使わない。必ずログイン中の team_id を入れる（50章）。
 *   * プレビューの段階では本体テーブルを書き換えない（39章）。
 *   * 取り込みで「新規作成した」行を import_record_links に残し、取り消せるようにする（48章）。
 */

const upsertModeSchema = z.enum(['insert_only', 'update_existing', 'skip_existing']);

const analyzeSchema = z.object({
  rawText: z.string().min(1, 'データが空です。貼り付けるか、CSVを選んでください。'),
  upsertMode: upsertModeSchema,
  /** 利用者が直した列マッピング（JSON）。未指定なら自動推測を使う。 */
  mappingJson: z.string().optional(),
});

export interface PreviewState {
  error?: string;
  preview?: {
    headers: string[];
    mappings: MappingSuggestion[];
    rows: AnalyzedRow[];
    summary: ImportSummary;
    warnings: string[];
    rawText: string;
    upsertMode: UpsertMode;
  };
}

const mappingArraySchema = z.array(
  z.object({
    sourceIndex: z.number().int().min(0),
    sourceColumn: z.string(),
    targetField: z.string().nullable(),
    confidence: z.number(),
    isAutoDetected: z.boolean(),
  }),
);

/**
 * 解析してプレビューを返す。DB は一切書き換えない（39章）。
 */
export async function analyzePlayerImport(
  _prevState: PreviewState,
  formData: FormData,
): Promise<PreviewState> {
  const session = await requirePermission('import.execute');

  const parsed = analyzeSchema.safeParse({
    rawText: formData.get('rawText'),
    upsertMode: formData.get('upsertMode') ?? 'insert_only',
    mappingJson: formData.get('mappingJson') ?? undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '入力内容を確認してください。' };
  }

  const { rawText, upsertMode, mappingJson } = parsed.data;

  if (rawText.length > limits.maxImportFileSizeBytes) {
    return {
      error: `データが大きすぎます（上限 ${Math.floor(limits.maxImportFileSizeBytes / 1024 / 1024)}MB）。`,
    };
  }

  const table = parseTable(rawText, { maxRows: limits.maxImportRows });
  if (table.headers.length === 0) {
    return { error: 'データが空です。1行目に見出し（氏名 など）を入れてください。' };
  }

  let mappings: MappingSuggestion[];
  if (mappingJson) {
    const mappingParsed = mappingArraySchema.safeParse(safeJsonParse(mappingJson));
    if (!mappingParsed.success) {
      return { error: '列の対応づけを読み取れませんでした。' };
    }
    mappings = mappingParsed.data.map((mapping) => ({
      ...mapping,
      targetField: (mapping.targetField as PlayerField | null) ?? null,
    }));
  } else {
    mappings = suggestMapping(table.headers);
  }

  const existingMembers = await listExistingMembers(session.teamId);

  const { rows, summary } = analyzePlayerRows({
    headers: table.headers,
    rows: table.rows,
    mappings,
    existingMembers,
    upsertMode,
    currentYear: new Date().getFullYear(),
  });

  return {
    preview: {
      headers: table.headers,
      mappings,
      rows,
      summary,
      warnings: table.warnings,
      rawText,
      upsertMode,
    },
  };
}

export interface ExecuteState {
  error?: string;
  result?: {
    sessionId: string;
    inserted: number;
    updated: number;
    skipped: number;
  };
}

/**
 * 取り込みを実行する。
 *
 * profiles には team_id が無いため RLS でチームを表現できない。
 * ここだけは管理用クライアントを使い、その代わりに
 *   1. 事前に import.execute を確認する
 *   2. team_id は必ずログイン中の値を入れる
 *   3. 監査ログに残す
 * を守る。
 */
export async function executePlayerImport(
  _prevState: ExecuteState,
  formData: FormData,
): Promise<ExecuteState> {
  const session = await requirePermission('import.execute');

  const parsed = analyzeSchema.safeParse({
    rawText: formData.get('rawText'),
    upsertMode: formData.get('upsertMode') ?? 'insert_only',
    mappingJson: formData.get('mappingJson') ?? undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '入力内容を確認してください。' };
  }

  const sourceType = formData.get('sourceType') === 'csv' ? 'csv' : 'paste';
  const table = parseTable(parsed.data.rawText, { maxRows: limits.maxImportRows });

  let mappings: MappingSuggestion[];
  if (parsed.data.mappingJson) {
    const mappingParsed = mappingArraySchema.safeParse(safeJsonParse(parsed.data.mappingJson));
    if (!mappingParsed.success) return { error: '列の対応づけを読み取れませんでした。' };
    mappings = mappingParsed.data.map((mapping) => ({
      ...mapping,
      targetField: (mapping.targetField as PlayerField | null) ?? null,
    }));
  } else {
    mappings = suggestMapping(table.headers);
  }

  const existingMembers = await listExistingMembers(session.teamId);
  const { rows, summary } = analyzePlayerRows({
    headers: table.headers,
    rows: table.rows,
    mappings,
    existingMembers,
    upsertMode: parsed.data.upsertMode,
    currentYear: new Date().getFullYear(),
  });

  const targets = importableRows(rows);
  if (targets.length === 0) {
    return { error: '取り込める行がありません。エラーの内容を確認してください。' };
  }

  const supabase = await createClient();
  const admin = createAdminClient();

  // --- Import Session を作る（47章） ---
  const { data: importSession, error: sessionError } = await supabase
    .from('import_sessions')
    .insert({
      team_id: session.teamId, // 50章: CSV の値ではなくログイン中のチーム
      created_by: session.profileId,
      import_type: 'player',
      source_type: sourceType,
      status: 'importing',
      upsert_mode: parsed.data.upsertMode,
      total_rows: summary.total,
      valid_rows: summary.valid,
      warning_rows: summary.warning,
      error_rows: summary.error,
      started_at: new Date().toISOString(),
      file_name: typeof formData.get('fileName') === 'string' ? String(formData.get('fileName')) : null,
    })
    .select('id')
    .single();

  if (sessionError || !importSession) {
    return { error: `取り込みを開始できませんでした: ${sessionError?.message ?? '不明なエラー'}` };
  }

  let inserted = 0;
  let updated = 0;
  const failures: string[] = [];

  for (const row of targets) {
    const player = row.normalized;
    if (!player) continue;

    try {
      if (row.action === 'insert') {
        const { data: profile, error: profileError } = await admin
          .from('profiles')
          .insert({
            full_name: player.full_name,
            furigana: player.furigana,
            email: player.email,
          })
          .select('id')
          .single();

        if (profileError || !profile) {
          failures.push(`${row.rowNumber}行目: ${profileError?.message ?? 'プロフィールを作れませんでした'}`);
          continue;
        }

        const { data: member, error: memberError } = await admin
          .from('team_members')
          .insert({
            team_id: session.teamId,
            profile_id: profile.id,
            role_code: 'player',
            status: 'active',
            position: player.position,
            sub_position: player.sub_position,
            jersey_number: player.jersey_number,
            grade: player.grade,
            admission_year: player.admission_year,
            personal_goal: player.personal_goal,
            external_source: player.external_id ? 'google_sheets_legacy' : null,
            external_id: player.external_id,
          })
          .select('id')
          .single();

        if (memberError || !member) {
          // 所属を作れなかった profiles は消しておく（孤児を残さない）
          await admin.from('profiles').delete().eq('id', profile.id);
          failures.push(`${row.rowNumber}行目: ${memberError?.message ?? '所属を作れませんでした'}`);
          continue;
        }

        // 48章: 取り消しのために「作った行」を控える
        await admin.from('import_record_links').insert([
          {
            import_session_id: importSession.id,
            target_table: 'profiles',
            target_id: profile.id,
            operation: 'insert',
          },
          {
            import_session_id: importSession.id,
            target_table: 'team_members',
            target_id: member.id,
            operation: 'insert',
          },
        ]);

        inserted += 1;
      } else if (row.action === 'update' && row.matchedMemberId) {
        // 更新前の値を控える（48章: 変更前値を監査履歴へ残す）
        const { data: before } = await admin
          .from('team_members')
          .select('*')
          .eq('id', row.matchedMemberId)
          .single();

        const { error: updateError } = await admin
          .from('team_members')
          .update({
            position: player.position,
            sub_position: player.sub_position,
            jersey_number: player.jersey_number,
            grade: player.grade,
            admission_year: player.admission_year,
            personal_goal: player.personal_goal,
          })
          .eq('id', row.matchedMemberId)
          .eq('team_id', session.teamId); // 別チームを触らせない

        if (updateError) {
          failures.push(`${row.rowNumber}行目: ${updateError.message}`);
          continue;
        }

        await admin.from('import_record_links').insert({
          import_session_id: importSession.id,
          target_table: 'team_members',
          target_id: row.matchedMemberId,
          operation: 'update',
          before_value: before ?? null,
        });

        updated += 1;
      }
    } catch (error) {
      failures.push(`${row.rowNumber}行目: ${error instanceof Error ? error.message : '不明なエラー'}`);
    }
  }

  const skipped = summary.total - inserted - updated;

  await supabase
    .from('import_sessions')
    .update({
      status: failures.length > 0 && inserted + updated === 0 ? 'failed' : 'completed',
      imported_rows: inserted + updated,
      skipped_rows: skipped,
      completed_at: new Date().toISOString(),
      note: failures.length > 0 ? failures.slice(0, 20).join('\n') : null,
    })
    .eq('id', importSession.id);

  // 63章: Import 実行を監査ログに残す
  await admin.from('audit_logs').insert({
    team_id: session.teamId,
    actor_id: session.profileId,
    action: 'import.execute',
    target_table: 'import_sessions',
    target_id: importSession.id,
    summary: `選手プロフィールを取り込み: 新規 ${inserted} / 更新 ${updated} / 対象外 ${skipped}`,
  });

  revalidatePath('/admin/import');
  revalidatePath('/members');

  return {
    result: { sessionId: importSession.id, inserted, updated, skipped },
  };
}

/**
 * 取り込みの取り消し（48章）。
 * このセッションで新規作成した行だけを消す。更新した行は戻さない
 * （戻す場合は before_value を使うが、その後の編集を壊す恐れがあるため既定では行わない）。
 */
export async function rollbackImport(sessionId: string): Promise<{ error?: string; removed?: number }> {
  const session = await requirePermission('import.execute');

  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: importSession } = await supabase
    .from('import_sessions')
    .select('id, team_id, status')
    .eq('id', sessionId)
    .eq('team_id', session.teamId)
    .maybeSingle();

  if (!importSession) {
    return { error: '対象の取り込み履歴が見つかりません。' };
  }
  if (importSession.status === 'rolled_back') {
    return { error: 'この取り込みは既に取り消されています。' };
  }

  const { data: links } = await admin
    .from('import_record_links')
    .select('id, target_table, target_id, operation')
    .eq('import_session_id', sessionId)
    .is('rolled_back_at', null);

  const inserts = (links ?? []).filter((link) => link.operation === 'insert');

  // team_members → profiles の順に消す（外部キーの向きに合わせる）
  const memberIds = inserts.filter((l) => l.target_table === 'team_members').map((l) => l.target_id);
  const profileIds = inserts.filter((l) => l.target_table === 'profiles').map((l) => l.target_id);

  if (memberIds.length > 0) {
    await admin.from('team_members').delete().in('id', memberIds).eq('team_id', session.teamId);
  }
  if (profileIds.length > 0) {
    // ログイン済みの利用者は消さない（後から本人が使い始めている可能性がある）
    await admin.from('profiles').delete().in('id', profileIds).is('user_id', null);
  }

  const now = new Date().toISOString();
  await admin.from('import_record_links').update({ rolled_back_at: now }).eq('import_session_id', sessionId);

  await supabase
    .from('import_sessions')
    .update({ status: 'rolled_back', rolled_back_at: now })
    .eq('id', sessionId);

  await admin.from('audit_logs').insert({
    team_id: session.teamId,
    actor_id: session.profileId,
    action: 'import.rollback',
    target_table: 'import_sessions',
    target_id: sessionId,
    summary: `取り込みを取り消し: ${memberIds.length} 名`,
  });

  revalidatePath('/admin/import');
  revalidatePath('/members');

  return { removed: memberIds.length };
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
