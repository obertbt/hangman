import type {
  EventType,
  ImportSessionStatus,
  ImportType,
  MemberStatus,
  Position,
  ReportVisibility,
  SeasonStatus,
  TrainingType,
} from '@/types/database.types';

/**
 * 画面に出す日本語。
 *
 * 表示文字列をコードのあちこちに散らかさない。
 * 「下書き」「回答待ち」のような言い回しは仕様書（27章・31章など）に合わせる。
 */

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  practice: '練習',
  match: '試合',
  meeting: 'ミーティング',
  measurement: '測定',
  training: 'トレーニング',
  rest: 'オフ',
  other: 'その他',
};

export const SEASON_STATUS_LABELS: Record<SeasonStatus, string> = {
  planning: '準備中',
  active: '進行中',
  completed: '終了',
  archived: '保管',
};

export const POSITION_LABELS: Record<Position, string> = {
  GK: 'GK',
  DF: 'DF',
  MF: 'MF',
  FW: 'FW',
  STAFF: 'スタッフ',
};

export const MEMBER_STATUS_LABELS: Record<MemberStatus, string> = {
  active: '在籍',
  inactive: '退部',
  graduated: '卒業',
  leave: '休部',
};

export const REPORT_VISIBILITY_LABELS: Record<ReportVisibility, string> = {
  private: '自分だけ',
  staff: 'コーチまで',
  team: 'チーム全員',
};

export const TRAINING_TYPE_LABELS: Record<TrainingType, string> = {
  running: 'ランニング',
  weight: 'ウェイト',
  self_practice: '自主練',
  recovery: 'リカバリー',
  stretch: 'ストレッチ',
  agility: 'アジリティ',
  other: 'その他',
};

/** 27章の日本語表示。 */
export const FEEDBACK_STATUS_LABELS = {
  draft: '下書き',
  submitted: '回答待ち',
  assigned: '担当決定',
  reviewing: '確認中',
  answered: '回答済み',
  acknowledged: '選手確認済み',
  follow_up: '再質問あり',
  closed: '完了',
  withdrawn: '取り下げ',
} as const;

/** 31章の表示。 */
export const SKILL_STATUS_LABELS = {
  not_started: '未着手',
  applied: '申請中',
  feedback: 'フィードバック中',
  approved: '承認済',
} as const;

export const IMPORT_TYPE_LABELS: Record<ImportType, string> = {
  player: '選手プロフィール',
  season: 'シーズン',
  week: '週',
  event: '練習予定',
  weekly_theme: '週間テーマ',
  daily_report: '日報',
  training_record: 'トレーニング記録',
  skill_progress: 'スキル進捗',
  skill_application: 'スキル申請履歴',
  measurement: '測定結果',
};

export const IMPORT_STATUS_LABELS: Record<ImportSessionStatus, string> = {
  analyzing: '解析中',
  mapping: '列の対応づけ',
  previewed: '確認待ち',
  importing: '取り込み中',
  completed: '完了',
  failed: '失敗',
  rolled_back: '取り消し済み',
  cancelled: '中止',
};

/** 26章の質問テンプレート。 */
export const QUESTION_TEMPLATES = [
  { value: 'judgement', label: 'この判断でよかったですか' },
  { value: 'play_choice', label: 'どのプレーを選ぶべきでしたか' },
  { value: 'technique', label: '技術的に直すべき点はありますか' },
  { value: 'positioning', label: 'ポジショニングは適切ですか' },
  { value: 'defense_priority', label: '守備の優先順位を教えてください' },
  { value: 'attack_positioning', label: '攻撃時の立ち位置を教えてください' },
  { value: 'skill_application', label: 'この動画をスキル申請に使えますか' },
  { value: 'other', label: 'その他' },
] as const;
