/**
 * Supabase のテーブル型。
 *
 * 本来は `pnpm db:types`（supabase gen types）で生成する。
 * ローカルに Supabase を立てられない環境でも型検査を通せるように、
 * 現時点で参照しているテーブルぶんを手で書いている。
 * Supabase を用意したら生成に切り替えること（README 参照）。
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// --- 値の種類（DB の CHECK 制約と対応させる） ---
export type RoleCode = 'system_admin' | 'coach' | 'manager' | 'player';
export type MemberStatus = 'active' | 'inactive' | 'graduated' | 'leave';
export type Position = 'GK' | 'DF' | 'MF' | 'FW' | 'STAFF';
export type SeasonStatus = 'planning' | 'active' | 'completed' | 'archived';
export type EventType = 'practice' | 'match' | 'meeting' | 'measurement' | 'training' | 'rest' | 'other';
export type EventTargetScope = 'team' | 'selected' | 'staff';
export type ReportVisibility = 'private' | 'staff' | 'team';
export type ReportStatus = 'draft' | 'submitted';
export type TrainingType =
  'running' | 'weight' | 'self_practice' | 'recovery' | 'stretch' | 'agility' | 'other';
export type ImportType =
  | 'player'
  | 'season'
  | 'week'
  | 'event'
  | 'weekly_theme'
  | 'daily_report'
  | 'training_record'
  | 'skill_progress'
  | 'skill_application'
  | 'measurement';
export type ImportSourceType = 'paste' | 'csv' | 'template_csv' | 'google_sheets_future';
export type ImportSessionStatus =
  'analyzing' | 'mapping' | 'previewed' | 'importing' | 'completed' | 'failed' | 'rolled_back' | 'cancelled';
export type ImportUpsertMode = 'insert_only' | 'update_existing' | 'skip_existing';
export type ImportRowStatus = 'valid' | 'warning' | 'error' | 'skipped' | 'imported';
export type ImportRowAction = 'insert' | 'update' | 'skip';

/** 挿入時に省略できる列をまとめる小道具。 */
type WithDefaults<Row, OptionalKeys extends keyof Row> = Omit<Row, OptionalKeys> &
  Partial<Pick<Row, OptionalKeys>>;

type Timestamps = 'created_at' | 'updated_at' | 'deleted_at';

export type TeamRow = {
  id: string;
  name: string;
  display_name: string;
  slug: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ProfileRow = {
  id: string;
  user_id: string | null;
  full_name: string;
  display_name: string | null;
  furigana: string | null;
  email: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type TeamMemberRow = {
  id: string;
  team_id: string;
  profile_id: string;
  role_code: RoleCode;
  status: MemberStatus;
  position: Position | null;
  sub_position: Position | null;
  jersey_number: number | null;
  grade: number | null;
  admission_year: number | null;
  personal_goal: string | null;
  external_source: string | null;
  external_id: string | null;
  joined_at: string | null;
  left_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type RoleRow = {
  code: RoleCode;
  label_ja: string;
  description: string | null;
  sort_order: number;
};

export type PermissionRow = {
  code: string;
  label_ja: string;
  description: string | null;
};

export type RolePermissionRow = {
  role_code: RoleCode;
  permission_code: string;
};

export type MemberPermissionRow = {
  id: string;
  team_member_id: string;
  permission_code: string;
  granted: boolean;
  granted_by: string | null;
  created_at: string;
};

export type SeasonRow = {
  id: string;
  team_id: string;
  name: string;
  fiscal_year: number;
  start_date: string;
  end_date: string;
  goal: string | null;
  theme: string | null;
  status: SeasonStatus;
  is_published: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type SeasonGoalRow = {
  id: string;
  team_id: string;
  season_id: string;
  title: string;
  description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type WeekRow = {
  id: string;
  team_id: string;
  season_id: string;
  start_date: string;
  end_date: string;
  theme: string | null;
  focus_task: string | null;
  key_skill: string | null;
  tactical_theme: string | null;
  weekly_message: string | null;
  carried_over_task: string | null;
  is_published: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type EventRow = {
  id: string;
  team_id: string;
  season_id: string | null;
  week_id: string | null;
  title: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  event_type: EventType;
  purpose: string | null;
  theme: string | null;
  menu: string | null;
  items_to_bring: string | null;
  notes: string | null;
  target_scope: EventTargetScope;
  is_published: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type DailyReportRow = {
  id: string;
  team_id: string;
  team_member_id: string;
  event_id: string | null;
  report_date: string;
  personal_goal: string | null;
  what_happened: string | null;
  what_went_well: string | null;
  what_went_wrong: string | null;
  cause: string | null;
  improvement: string | null;
  prevention: string | null;
  response_taken: string | null;
  next_action: string | null;
  self_rating: number | null;
  intensity: number | null;
  fatigue_level: number | null;
  mood: number | null;
  condition_level: number | null;
  free_note: string | null;
  visibility: ReportVisibility;
  status: ReportStatus;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type DailyConditionRow = {
  id: string;
  team_id: string;
  team_member_id: string;
  event_id: string | null;
  recorded_on: string;
  condition_level: number | null;
  fatigue_level: number | null;
  sleep_hours: number | null;
  has_pain: boolean;
  pain_note: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type PracticeGoalRow = {
  id: string;
  team_id: string;
  team_member_id: string;
  event_id: string | null;
  target_date: string;
  goal: string;
  source_feedback_id: string | null;
  achieved: boolean | null;
  reflection: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type TrainingRecordRow = {
  id: string;
  team_id: string;
  team_member_id: string;
  event_id: string | null;
  performed_on: string;
  training_type: TrainingType;
  menu: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_minutes: number | null;
  intensity: number | null;
  fatigue_level: number | null;
  comment: string | null;
  distance_km: number | null;
  pace_seconds_per_km: number | null;
  heart_rate_avg: number | null;
  rep_count: number | null;
  skill_theme: string | null;
  outcome: string | null;
  visibility: ReportVisibility;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type TrainingExerciseRow = {
  id: string;
  team_id: string;
  training_record_id: string;
  name: string;
  sort_order: number;
  created_at: string;
};

export type TrainingSetRow = {
  id: string;
  team_id: string;
  training_exercise_id: string;
  set_number: number;
  weight_kg: number | null;
  reps: number | null;
  created_at: string;
};

export type ImportSessionRow = {
  id: string;
  team_id: string;
  created_by: string;
  import_type: ImportType;
  source_type: ImportSourceType;
  status: ImportSessionStatus;
  upsert_mode: ImportUpsertMode;
  total_rows: number;
  valid_rows: number;
  warning_rows: number;
  error_rows: number;
  imported_rows: number;
  skipped_rows: number;
  file_name: string | null;
  note: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  rolled_back_at: string | null;
};

export type ImportRowRow = {
  id: string;
  import_session_id: string;
  row_number: number;
  raw_values: Json;
  normalized_values: Json | null;
  status: ImportRowStatus;
  action: ImportRowAction;
  matched_record_id: string | null;
  match_reason: string | null;
  match_candidates: Json | null;
  messages: Json;
  created_at: string;
};

export type ImportMappingRow = {
  id: string;
  import_session_id: string;
  source_column: string;
  source_index: number;
  target_field: string | null;
  is_auto_detected: boolean;
  confidence: number | null;
  created_at: string;
};

export type ImportRecordLinkRow = {
  id: string;
  import_session_id: string;
  import_row_id: string | null;
  target_table: string;
  target_id: string;
  operation: 'insert' | 'update';
  before_value: Json | null;
  rolled_back_at: string | null;
  created_at: string;
};

export type NotificationRow = {
  id: string;
  team_id: string;
  notification_type: string;
  title: string;
  body: string | null;
  link_path: string | null;
  related_table: string | null;
  related_id: string | null;
  created_by: string | null;
  created_at: string;
};

export type NotificationTargetRow = {
  id: string;
  notification_id: string;
  team_member_id: string;
  read_at: string | null;
  created_at: string;
};

export type AuditLogRow = {
  id: string;
  team_id: string | null;
  actor_id: string | null;
  action: string;
  target_table: string | null;
  target_id: string | null;
  summary: string | null;
  before_value: Json | null;
  after_value: Json | null;
  created_at: string;
};

export type TeamInvitationRow = {
  id: string;
  team_id: string;
  team_member_id: string | null;
  email: string;
  role_code: RoleCode;
  token: string;
  invited_by: string | null;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
};

type TableShape<Row, InsertOptional extends keyof Row> = {
  Row: Row;
  Insert: WithDefaults<Row, InsertOptional>;
  Update: Partial<Row>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      teams: TableShape<TeamRow, 'id' | 'description' | Timestamps>;
      profiles: TableShape<
        ProfileRow,
        'id' | 'user_id' | 'display_name' | 'furigana' | 'email' | 'avatar_url' | 'bio' | Timestamps
      >;
      team_members: TableShape<
        TeamMemberRow,
        | 'id'
        | 'status'
        | 'position'
        | 'sub_position'
        | 'jersey_number'
        | 'grade'
        | 'admission_year'
        | 'personal_goal'
        | 'external_source'
        | 'external_id'
        | 'joined_at'
        | 'left_at'
        | Timestamps
      >;
      roles: TableShape<RoleRow, 'description' | 'sort_order'>;
      permissions: TableShape<PermissionRow, 'description'>;
      role_permissions: TableShape<RolePermissionRow, never>;
      member_permissions: TableShape<MemberPermissionRow, 'id' | 'granted' | 'granted_by' | 'created_at'>;
      team_invitations: TableShape<
        TeamInvitationRow,
        'id' | 'team_member_id' | 'invited_by' | 'accepted_at' | 'created_at'
      >;
      seasons: TableShape<
        SeasonRow,
        'id' | 'goal' | 'theme' | 'status' | 'is_published' | 'created_by' | Timestamps
      >;
      season_goals: TableShape<SeasonGoalRow, 'id' | 'description' | 'sort_order' | Timestamps>;
      weeks: TableShape<
        WeekRow,
        | 'id'
        | 'theme'
        | 'focus_task'
        | 'key_skill'
        | 'tactical_theme'
        | 'weekly_message'
        | 'carried_over_task'
        | 'is_published'
        | 'created_by'
        | Timestamps
      >;
      events: TableShape<
        EventRow,
        | 'id'
        | 'season_id'
        | 'week_id'
        | 'start_time'
        | 'end_time'
        | 'location'
        | 'event_type'
        | 'purpose'
        | 'theme'
        | 'menu'
        | 'items_to_bring'
        | 'notes'
        | 'target_scope'
        | 'is_published'
        | 'created_by'
        | Timestamps
      >;
      daily_reports: TableShape<
        DailyReportRow,
        Exclude<keyof DailyReportRow, 'team_id' | 'team_member_id' | 'report_date'>
      >;
      daily_conditions: TableShape<
        DailyConditionRow,
        Exclude<keyof DailyConditionRow, 'team_id' | 'team_member_id' | 'recorded_on'>
      >;
      practice_goals: TableShape<
        PracticeGoalRow,
        Exclude<keyof PracticeGoalRow, 'team_id' | 'team_member_id' | 'target_date' | 'goal'>
      >;
      training_records: TableShape<
        TrainingRecordRow,
        Exclude<keyof TrainingRecordRow, 'team_id' | 'team_member_id' | 'performed_on' | 'training_type'>
      >;
      training_exercises: TableShape<
        TrainingExerciseRow,
        Exclude<keyof TrainingExerciseRow, 'team_id' | 'training_record_id' | 'name'>
      >;
      training_sets: TableShape<
        TrainingSetRow,
        Exclude<keyof TrainingSetRow, 'team_id' | 'training_exercise_id' | 'set_number'>
      >;
      import_sessions: TableShape<
        ImportSessionRow,
        Exclude<keyof ImportSessionRow, 'team_id' | 'created_by' | 'import_type' | 'source_type'>
      >;
      import_rows: TableShape<
        ImportRowRow,
        Exclude<keyof ImportRowRow, 'import_session_id' | 'row_number' | 'raw_values'>
      >;
      import_mappings: TableShape<
        ImportMappingRow,
        Exclude<keyof ImportMappingRow, 'import_session_id' | 'source_column' | 'source_index'>
      >;
      import_record_links: TableShape<
        ImportRecordLinkRow,
        Exclude<keyof ImportRecordLinkRow, 'import_session_id' | 'target_table' | 'target_id' | 'operation'>
      >;
      notifications: TableShape<
        NotificationRow,
        Exclude<keyof NotificationRow, 'team_id' | 'notification_type' | 'title'>
      >;
      notification_targets: TableShape<NotificationTargetRow, 'id' | 'read_at' | 'created_at'>;
      audit_logs: TableShape<AuditLogRow, Exclude<keyof AuditLogRow, 'action'>>;
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
