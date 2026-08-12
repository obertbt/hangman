import 'server-only';

import { ROLE_LABELS } from '@/lib/auth/permissions';
import type { AppSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import {
  MEMBER_STATUS_LABELS,
  POSITION_LABELS,
  REPORT_VISIBILITY_LABELS,
  SKILL_STATUS_LABELS,
  TRAINING_TYPE_LABELS,
} from '@/lib/labels';

import { flattenText, protectFromSpreadsheet, toCsv, type CsvColumn } from './lib/csv';

/**
 * 記録の書き出し（依頼書3章の12: 過去の資産を失わない）。
 *
 * **どこまで出せるかは RLS が決める。**
 * 選手が実行すれば自分のぶんだけ、コーチが実行すれば見える範囲すべてが出る。
 * ここで「誰は何を出してよいか」を書き直すと、画面と RLS で規則が二重になる。
 *
 * 出したものは Import Center で読み直せる形にしておく（37章）。
 */

export const EXPORT_TYPES = ['members', 'reports', 'training', 'skills'] as const;
export type ExportType = (typeof EXPORT_TYPES)[number];

export const EXPORT_LABELS: Record<ExportType, string> = {
  members: '名簿',
  reports: '日報',
  training: 'トレーニング記録',
  skills: 'スキルの到達状況',
};

export const EXPORT_DESCRIPTIONS: Record<ExportType, string> = {
  members: '在籍・卒業をまとめた部員の一覧',
  reports: '提出済みの日報。自分の見える範囲だけが出ます',
  training: 'トレーニングの記録。自分の見える範囲だけが出ます',
  skills: '誰がどのスキルまで届いているか',
};

export function isExportType(value: string): value is ExportType {
  return (EXPORT_TYPES as readonly string[]).includes(value);
}

/** 文章の列は、改行を畳んだうえで数式として解釈されないようにする。 */
function text(value: string | null | undefined): string {
  return protectFromSpreadsheet(flattenText(value));
}

export async function buildExportCsv(session: AppSession, type: ExportType): Promise<string> {
  switch (type) {
    case 'members':
      return exportMembers(session);
    case 'reports':
      return exportReports(session);
    case 'training':
      return exportTraining(session);
    case 'skills':
      return exportSkills(session);
  }
}

/** team_member_id → 表示名。RLS で見える範囲だけが埋まる。 */
async function memberNames(session: AppSession): Promise<Map<string, string>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('team_members')
    .select('id, profiles(full_name, display_name)')
    .eq('team_id', session.teamId);

  const result = new Map<string, string>();
  for (const row of data ?? []) {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    const display = profile?.display_name;
    const full = profile?.full_name;
    result.set(row.id, display && display !== '' ? display : (full ?? '不明'));
  }
  return result;
}

interface MemberExportRow {
  name: string;
  role: string;
  status: string;
  position: string;
  jerseyNumber: number | null;
  grade: number | null;
  admissionYear: number | null;
  email: string;
}

async function exportMembers(session: AppSession): Promise<string> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('team_members')
    .select(
      'id, role_code, status, position, jersey_number, grade, admission_year, profiles(full_name, display_name, email)',
    )
    .eq('team_id', session.teamId)
    .is('deleted_at', null)
    .order('jersey_number', { ascending: true, nullsFirst: false });

  const rows: MemberExportRow[] = (data ?? []).map((member) => {
    const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
    return {
      name: profile?.full_name ?? '不明',
      role: ROLE_LABELS[member.role_code] ?? member.role_code,
      status: MEMBER_STATUS_LABELS[member.status] ?? member.status,
      position: member.position ? (POSITION_LABELS[member.position] ?? member.position) : '',
      jerseyNumber: member.jersey_number,
      grade: member.grade,
      admissionYear: member.admission_year,
      email: profile?.email ?? '',
    };
  });

  const columns: CsvColumn<MemberExportRow>[] = [
    { header: '氏名', value: (row) => text(row.name) },
    { header: '役割', value: (row) => row.role },
    { header: '在籍状況', value: (row) => row.status },
    { header: 'ポジション', value: (row) => row.position },
    { header: '背番号', value: (row) => row.jerseyNumber },
    { header: '学年', value: (row) => row.grade },
    { header: '入学年度', value: (row) => row.admissionYear },
    { header: 'メールアドレス', value: (row) => row.email },
  ];

  return toCsv(rows, columns);
}

async function exportReports(session: AppSession): Promise<string> {
  const supabase = await createClient();

  const [{ data }, names] = await Promise.all([
    supabase
      .from('daily_reports')
      .select('*')
      .eq('team_id', session.teamId)
      .is('deleted_at', null)
      .order('report_date', { ascending: false })
      .limit(5000),
    memberNames(session),
  ]);

  const rows = data ?? [];

  const columns: CsvColumn<(typeof rows)[number]>[] = [
    { header: '日付', value: (row) => row.report_date },
    { header: '氏名', value: (row) => text(names.get(row.team_member_id) ?? '不明') },
    { header: '状態', value: (row) => (row.status === 'submitted' ? '提出済み' : '下書き') },
    { header: '公開範囲', value: (row) => REPORT_VISIBILITY_LABELS[row.visibility] },
    { header: '今日の目標', value: (row) => text(row.personal_goal) },
    { header: '何があったか', value: (row) => text(row.what_happened) },
    { header: 'よかったこと', value: (row) => text(row.what_went_well) },
    { header: 'うまくいかなかったこと', value: (row) => text(row.what_went_wrong) },
    { header: '原因', value: (row) => text(row.cause) },
    { header: '改善', value: (row) => text(row.improvement) },
    { header: '再発防止', value: (row) => text(row.prevention) },
    { header: '次にやること', value: (row) => text(row.next_action) },
    { header: '自己評価', value: (row) => row.self_rating },
    { header: '強度', value: (row) => row.intensity },
    { header: '疲労', value: (row) => row.fatigue_level },
    { header: '気分', value: (row) => row.mood },
    { header: '自由記述', value: (row) => text(row.free_note) },
  ];

  return toCsv(rows, columns);
}

async function exportTraining(session: AppSession): Promise<string> {
  const supabase = await createClient();

  const [{ data }, names] = await Promise.all([
    supabase
      .from('training_records')
      .select('*')
      .eq('team_id', session.teamId)
      .is('deleted_at', null)
      .order('performed_on', { ascending: false })
      .limit(5000),
    memberNames(session),
  ]);

  const rows = data ?? [];

  const columns: CsvColumn<(typeof rows)[number]>[] = [
    { header: '日付', value: (row) => row.performed_on },
    { header: '氏名', value: (row) => text(names.get(row.team_member_id) ?? '不明') },
    { header: '種別', value: (row) => TRAINING_TYPE_LABELS[row.training_type] },
    { header: 'メニュー', value: (row) => text(row.menu) },
    { header: '実施時間(分)', value: (row) => row.duration_minutes },
    { header: '距離(km)', value: (row) => row.distance_km },
    { header: 'ペース(秒/km)', value: (row) => row.pace_seconds_per_km },
    { header: '平均心拍', value: (row) => row.heart_rate_avg },
    { header: '回数', value: (row) => row.rep_count },
    { header: '強度', value: (row) => row.intensity },
    { header: '疲労', value: (row) => row.fatigue_level },
    { header: 'テーマ', value: (row) => text(row.skill_theme) },
    { header: '結果', value: (row) => text(row.outcome) },
    { header: 'コメント', value: (row) => text(row.comment) },
  ];

  return toCsv(rows, columns);
}

async function exportSkills(session: AppSession): Promise<string> {
  const supabase = await createClient();

  const [skillResult, playerSkillResult, categoryResult, names] = await Promise.all([
    supabase.from('skills').select('id, name, skill_category_id').eq('team_id', session.teamId),
    supabase
      .from('player_skills')
      .select('*')
      .eq('team_id', session.teamId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(5000),
    supabase.from('skill_categories').select('id, name').eq('team_id', session.teamId),
    memberNames(session),
  ]);

  const skillById = new Map((skillResult.data ?? []).map((skill) => [skill.id, skill]));
  const categoryById = new Map((categoryResult.data ?? []).map((category) => [category.id, category.name]));
  const rows = playerSkillResult.data ?? [];

  const columns: CsvColumn<(typeof rows)[number]>[] = [
    { header: '氏名', value: (row) => text(names.get(row.team_member_id) ?? '不明') },
    {
      header: '大分類',
      value: (row) => {
        const skill = skillById.get(row.skill_id);
        return skill ? (categoryById.get(skill.skill_category_id) ?? '') : '';
      },
    },
    { header: 'スキル', value: (row) => text(skillById.get(row.skill_id)?.name ?? '不明') },
    { header: '状態', value: (row) => SKILL_STATUS_LABELS[row.status] },
    { header: '承認日時', value: (row) => row.approved_at ?? '' },
    { header: 'メモ', value: (row) => text(row.note) },
  ];

  return toCsv(rows, columns);
}
