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

export type VideoProviderName = 'youtube' | 'r2' | 'cloudflare_stream' | 'external';
export type MediaVisibility = 'private_staff' | 'selected_members' | 'team';

export type VideoRow = {
  id: string;
  team_id: string;
  provider: VideoProviderName;
  provider_video_id: string | null;
  file_id: string | null;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  recorded_at: string | null;
  uploaded_at: string | null;
  event_id: string | null;
  visibility: MediaVisibility;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type VideoClipRow = {
  id: string;
  team_id: string;
  video_id: string;
  created_by: string;
  start_seconds: number;
  end_seconds: number;
  title: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type FeedbackStatus =
  | 'draft'
  | 'submitted'
  | 'assigned'
  | 'reviewing'
  | 'answered'
  | 'acknowledged'
  | 'follow_up'
  | 'closed'
  | 'withdrawn';

export type PlayerSkillStatus = 'not_started' | 'applied' | 'feedback' | 'approved';

export type SkillApplicationStatus =
  'draft' | 'submitted' | 'reviewing' | 'approved' | 'rejected' | 'withdrawn';

export type SkillReviewDecision = 'approved' | 'rejected' | 'needs_more';

export type SkillEvidenceType = 'video' | 'video_clip' | 'feedback_request' | 'file' | 'note';

export type QuestionType =
  | 'judgement'
  | 'play_choice'
  | 'technique'
  | 'positioning'
  | 'defense_priority'
  | 'attack_positioning'
  | 'skill_application'
  | 'other';

export type FeedbackRequestRow = {
  id: string;
  team_id: string;
  requester_id: string;
  assigned_coach_id: string | null;
  video_id: string | null;
  video_clip_id: string | null;
  event_id: string | null;
  daily_report_id: string | null;
  skill_id: string | null;
  skill_application_id: string | null;
  question_type: QuestionType;
  question: string;
  status: FeedbackStatus;
  visibility: MediaVisibility;
  submitted_at: string | null;
  assigned_at: string | null;
  answered_at: string | null;
  acknowledged_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type StorageProvider = 'r2' | 's3' | 'local';
export type MediaType = 'video' | 'image' | 'pdf' | 'other';
export type UploadStatus =
  'pending' | 'uploading' | 'uploaded' | 'verifying' | 'ready' | 'failed' | 'quarantined' | 'deleted';

export type FileRow = {
  id: string;
  team_id: string;
  uploaded_by: string;
  storage_provider: StorageProvider;
  bucket: string;
  storage_key: string;
  original_filename: string | null;
  normalized_filename: string | null;
  mime_type: string;
  size_bytes: number;
  checksum: string | null;
  media_type: MediaType;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  video_codec: string | null;
  audio_codec: string | null;
  frame_rate: number | null;
  upload_status: UploadStatus;
  visibility: MediaVisibility;
  retention_policy: 'keep' | 'temporary';
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type UploadSessionRow = {
  id: string;
  team_id: string;
  created_by: string;
  file_id: string | null;
  bucket: string;
  storage_key: string;
  declared_mime: string;
  declared_size: number;
  media_type: MediaType;
  status: UploadStatus;
  failure_reason: string | null;
  expires_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SkillCategoryRow = {
  id: string;
  team_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type SkillRow = {
  id: string;
  team_id: string;
  skill_category_id: string;
  parent_id: string | null;
  name: string;
  description: string | null;
  criteria: string | null;
  level: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type PlayerSkillRow = {
  id: string;
  team_id: string;
  team_member_id: string;
  skill_id: string;
  status: PlayerSkillStatus;
  approved_at: string | null;
  approved_by: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type SkillApplicationRow = {
  id: string;
  team_id: string;
  team_member_id: string;
  skill_id: string;
  comment: string | null;
  status: SkillApplicationStatus;
  submitted_at: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type SkillApplicationItemRow = {
  id: string;
  team_id: string;
  skill_application_id: string;
  item_type: SkillEvidenceType;
  video_id: string | null;
  video_clip_id: string | null;
  feedback_request_id: string | null;
  file_id: string | null;
  note: string | null;
  created_at: string;
};

export type SkillReviewRow = {
  id: string;
  team_id: string;
  skill_application_id: string;
  reviewer_id: string;
  decision: SkillReviewDecision;
  comment: string | null;
  created_at: string;
};

export type SkillStatusHistoryRow = {
  id: string;
  team_id: string;
  player_skill_id: string;
  from_status: string | null;
  to_status: string;
  changed_by: string | null;
  reason: string | null;
  created_at: string;
};

export type FeedbackResponseRow = {
  id: string;
  team_id: string;
  feedback_request_id: string;
  responder_id: string;
  conclusion: string;
  positive_points: string | null;
  improvement_points: string | null;
  recommended_action: string | null;
  technical_correction: string | null;
  next_task: string | null;
  related_skill_id: string | null;
  reference_video_id: string | null;
  requires_in_person_review: boolean;
  suggests_team_share: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type FeedbackMessageType = 'comment' | 'follow_up_question' | 'system';

export type FeedbackMessageRow = {
  id: string;
  team_id: string;
  feedback_request_id: string;
  sender_id: string;
  message_type: FeedbackMessageType;
  body: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ShareRequestStatus = 'pending' | 'approved' | 'rejected';

export type FeedbackShareRequestRow = {
  id: string;
  team_id: string;
  feedback_request_id: string;
  requested_by: string;
  target_visibility: 'selected_members' | 'team';
  status: ShareRequestStatus;
  responded_at: string | null;
  reason: string | null;
  created_at: string;
  updated_at: string;
};

export type FeedbackStatusHistoryRow = {
  id: string;
  team_id: string;
  feedback_request_id: string;
  from_status: FeedbackStatus | null;
  to_status: FeedbackStatus;
  changed_by: string | null;
  note: string | null;
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

export type MeasurementEventRow = {
  id: string;
  team_id: string;
  season_id: string | null;
  event_id: string | null;
  name: string;
  measured_on: string;
  note: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type MeasurementItemRow = {
  id: string;
  team_id: string;
  name: string;
  unit: string | null;
  /** 値が大きいほど良いのか小さいほど良いのか。 */
  better: 'higher' | 'lower';
  sort_order: number;
  created_at: string;
};

export type MeasurementResultRow = {
  id: string;
  team_id: string;
  measurement_event_id: string;
  measurement_item_id: string;
  team_member_id: string;
  value: number | null;
  text_value: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type StorageUsageSnapshotRow = {
  id: string;
  team_id: string;
  captured_on: string;
  total_bytes: number;
  video_bytes: number;
  image_bytes: number;
  pdf_bytes: number;
  temp_bytes: number;
  deleted_bytes: number;
  file_count: number;
  created_at: string;
};

export type FileDeletionJobRow = {
  id: string;
  team_id: string;
  file_id: string;
  scheduled_for: string;
  status: 'pending' | 'done' | 'failed';
  attempted_at: string | null;
  error_message: string | null;
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
      measurement_events: TableShape<
        MeasurementEventRow,
        Exclude<keyof MeasurementEventRow, 'team_id' | 'name' | 'measured_on'>
      >;
      measurement_items: TableShape<
        MeasurementItemRow,
        Exclude<keyof MeasurementItemRow, 'team_id' | 'name'>
      >;
      measurement_results: TableShape<
        MeasurementResultRow,
        Exclude<
          keyof MeasurementResultRow,
          'team_id' | 'measurement_event_id' | 'measurement_item_id' | 'team_member_id'
        >
      >;
      storage_usage_snapshots: TableShape<
        StorageUsageSnapshotRow,
        Exclude<keyof StorageUsageSnapshotRow, 'team_id' | 'captured_on'>
      >;
      file_deletion_jobs: TableShape<
        FileDeletionJobRow,
        Exclude<keyof FileDeletionJobRow, 'team_id' | 'file_id' | 'scheduled_for'>
      >;
      videos: TableShape<VideoRow, Exclude<keyof VideoRow, 'team_id' | 'provider' | 'title' | 'created_by'>>;
      video_clips: TableShape<
        VideoClipRow,
        Exclude<keyof VideoClipRow, 'team_id' | 'video_id' | 'created_by' | 'start_seconds' | 'end_seconds'>
      >;
      feedback_requests: TableShape<
        FeedbackRequestRow,
        Exclude<keyof FeedbackRequestRow, 'team_id' | 'requester_id' | 'question'>
      >;
      feedback_responses: TableShape<
        FeedbackResponseRow,
        Exclude<keyof FeedbackResponseRow, 'team_id' | 'feedback_request_id' | 'responder_id' | 'conclusion'>
      >;
      feedback_messages: TableShape<
        FeedbackMessageRow,
        Exclude<keyof FeedbackMessageRow, 'team_id' | 'feedback_request_id' | 'sender_id' | 'body'>
      >;
      feedback_share_requests: TableShape<
        FeedbackShareRequestRow,
        Exclude<
          keyof FeedbackShareRequestRow,
          'team_id' | 'feedback_request_id' | 'requested_by' | 'target_visibility'
        >
      >;
      feedback_status_histories: TableShape<
        FeedbackStatusHistoryRow,
        Exclude<keyof FeedbackStatusHistoryRow, 'team_id' | 'feedback_request_id' | 'to_status'>
      >;
      skill_categories: TableShape<SkillCategoryRow, Exclude<keyof SkillCategoryRow, 'team_id' | 'name'>>;
      skills: TableShape<SkillRow, Exclude<keyof SkillRow, 'team_id' | 'skill_category_id' | 'name'>>;
      player_skills: TableShape<
        PlayerSkillRow,
        Exclude<keyof PlayerSkillRow, 'team_id' | 'team_member_id' | 'skill_id'>
      >;
      skill_applications: TableShape<
        SkillApplicationRow,
        Exclude<keyof SkillApplicationRow, 'team_id' | 'team_member_id' | 'skill_id'>
      >;
      skill_application_items: TableShape<
        SkillApplicationItemRow,
        Exclude<keyof SkillApplicationItemRow, 'team_id' | 'skill_application_id' | 'item_type'>
      >;
      skill_reviews: TableShape<
        SkillReviewRow,
        Exclude<keyof SkillReviewRow, 'team_id' | 'skill_application_id' | 'reviewer_id' | 'decision'>
      >;
      skill_status_histories: TableShape<
        SkillStatusHistoryRow,
        Exclude<keyof SkillStatusHistoryRow, 'team_id' | 'player_skill_id' | 'to_status'>
      >;
      files: TableShape<
        FileRow,
        Exclude<
          keyof FileRow,
          'team_id' | 'uploaded_by' | 'bucket' | 'storage_key' | 'mime_type' | 'size_bytes'
        >
      >;
      upload_sessions: TableShape<
        UploadSessionRow,
        Exclude<
          keyof UploadSessionRow,
          | 'team_id'
          | 'created_by'
          | 'bucket'
          | 'storage_key'
          | 'declared_mime'
          | 'declared_size'
          | 'expires_at'
        >
      >;
    };
    Views: Record<never, never>;
    Functions: {
      /** 論理削除は RPC で行う（0013）。SELECT ポリシーとの兼ね合いのため。 */
      soft_delete_video: { Args: { p_video_id: string }; Returns: undefined };
      soft_delete_video_clip: { Args: { p_clip_id: string }; Returns: undefined };
      /** 容量の集計と掃除は、本人以外・削除済みの行を触るので関数を通す（0016）。 */
      capture_storage_usage: { Args: { p_team_id: string }; Returns: StorageUsageSnapshotRow };
      complete_file_deletion: {
        Args: { p_job_id: string; p_error?: string | null };
        Returns: undefined;
      };
      expire_stale_uploads: { Args: { p_team_id: string }; Returns: number };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
