/**
 * Supabase のスキーマに対応する型。
 *
 * 将来的には次のコマンドで再生成できる形にしてある。
 *   npx supabase gen types typescript --local > src/types/database.types.ts
 *
 * 現時点では Supabase プロジェクトが無くても型チェックできるよう、
 * supabase/migrations の内容に合わせて手で維持している。
 */

export type Visibility = 'private' | 'group' | 'selected';
export type SessionStatus = 'running' | 'paused' | 'completed' | 'cancelled';
export type GroupRole = 'owner' | 'admin' | 'member';
export type ReactionType = 'cheer' | 'good_job' | 'amazing' | 'together' | 'streak';

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Relationship<Column extends string, Referenced extends string> = {
  foreignKeyName: string;
  columns: [Column];
  isOneToOne: false;
  referencedRelation: Referenced;
  referencedColumns: ['id'];
};

type TableShape<Row, Insert, Update, Relationships extends readonly unknown[] = []> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  /** 埋め込み select（`profiles(*)` など）の解決に使う外部キー情報 */
  Relationships: Relationships;
};

export type ProfileRow = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  timezone: string;
  default_visibility: Visibility;
  created_at: string;
  updated_at: string;
};

export type GroupRow = {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export type GroupMemberRow = {
  id: string;
  group_id: string;
  user_id: string;
  role: GroupRole;
  joined_at: string;
};

export type GroupInvitationRow = {
  id: string;
  group_id: string;
  token: string;
  invited_by: string;
  expires_at: string;
  max_uses: number;
  used_count: number;
  revoked_at: string | null;
  created_at: string;
};

export type CategoryRow = {
  id: string;
  user_id: string | null;
  group_id: string | null;
  name: string;
  icon: string;
  color: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

export type ActivitySessionRow = {
  id: string;
  user_id: string;
  category_id: string;
  title: string | null;
  note: string | null;
  status: SessionStatus;
  started_at: string;
  paused_at: string | null;
  total_paused_seconds: number;
  ended_at: string | null;
  duration_seconds: number | null;
  created_at: string;
  updated_at: string;
};

export type ActivityPostRow = {
  id: string;
  user_id: string;
  session_id: string | null;
  category_id: string;
  title: string | null;
  body: string | null;
  duration_seconds: number;
  activity_date: string;
  visibility: Visibility;
  group_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type PostAllowedUserRow = {
  post_id: string;
  user_id: string;
};

export type ReactionRow = {
  id: string;
  post_id: string;
  user_id: string;
  reaction_type: ReactionType;
  created_at: string;
};

export type CommentRow = {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  is_hidden: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ActivityPhotoRow = {
  id: string;
  post_id: string;
  user_id: string;
  /** 非公開バケット内の位置。表示するときだけ期限付き URL を発行する。 */
  storage_path: string;
  sort_order: number;
  created_at: string;
};

export type DailyGoalRow = {
  id: string;
  user_id: string;
  goal_date: string;
  target_seconds: number;
  message: string | null;
  created_at: string;
  updated_at: string;
};

export type WeeklyGoalRow = {
  id: string;
  user_id: string;
  week_start_date: string;
  category_id: string | null;
  target_seconds: number;
  message: string | null;
  created_at: string;
  updated_at: string;
};

/** get_active_group_members() の戻り値 */
export type ActiveGroupMember = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  category_name: string;
  category_icon: string;
  category_color: string;
  status: Extract<SessionStatus, 'running' | 'paused'>;
  started_at: string;
  paused_at: string | null;
  total_paused_seconds: number;
};

/** get_invitation_preview() の戻り値 */
export type InvitationPreview = {
  group_id: string | null;
  group_name: string | null;
  inviter_name: string | null;
  member_count: number;
  is_valid: boolean;
  reason: 'ok' | 'not_found' | 'expired' | 'revoked' | 'exhausted';
};

type Insertable<Row, Required extends keyof Row, Generated extends keyof Row> = Pick<Row, Required> &
  Partial<Omit<Row, Required | Generated>> &
  Partial<Pick<Row, Generated>>;

export type Database = {
  public: {
    Tables: {
      profiles: TableShape<
        ProfileRow,
        Insertable<ProfileRow, 'id' | 'display_name', 'created_at' | 'updated_at'>,
        Partial<ProfileRow>
      >;
      groups: TableShape<
        GroupRow,
        Insertable<GroupRow, 'name' | 'owner_id', 'id' | 'created_at' | 'updated_at'>,
        Partial<GroupRow>,
        [Relationship<'owner_id', 'profiles'>]
      >;
      group_members: TableShape<
        GroupMemberRow,
        Insertable<GroupMemberRow, 'group_id' | 'user_id', 'id' | 'joined_at'>,
        Partial<GroupMemberRow>,
        [Relationship<'group_id', 'groups'>, Relationship<'user_id', 'profiles'>]
      >;
      group_invitations: TableShape<
        GroupInvitationRow,
        Insertable<
          GroupInvitationRow,
          'group_id' | 'invited_by',
          'id' | 'token' | 'expires_at' | 'max_uses' | 'used_count' | 'created_at'
        >,
        Partial<GroupInvitationRow>,
        [Relationship<'group_id', 'groups'>, Relationship<'invited_by', 'profiles'>]
      >;
      categories: TableShape<
        CategoryRow,
        Insertable<CategoryRow, 'name', 'id' | 'icon' | 'color' | 'sort_order' | 'is_active' | 'created_at'>,
        Partial<CategoryRow>,
        [Relationship<'user_id', 'profiles'>, Relationship<'group_id', 'groups'>]
      >;
      activity_sessions: TableShape<
        ActivitySessionRow,
        Insertable<
          ActivitySessionRow,
          'user_id' | 'category_id',
          'id' | 'status' | 'started_at' | 'total_paused_seconds' | 'created_at' | 'updated_at'
        >,
        Partial<ActivitySessionRow>,
        [Relationship<'user_id', 'profiles'>, Relationship<'category_id', 'categories'>]
      >;
      activity_posts: TableShape<
        ActivityPostRow,
        Insertable<
          ActivityPostRow,
          'user_id' | 'category_id' | 'duration_seconds' | 'activity_date',
          'id' | 'visibility' | 'created_at' | 'updated_at'
        >,
        Partial<ActivityPostRow>,
        [
          Relationship<'user_id', 'profiles'>,
          Relationship<'category_id', 'categories'>,
          Relationship<'group_id', 'groups'>,
          Relationship<'session_id', 'activity_sessions'>,
        ]
      >;
      post_allowed_users: TableShape<
        PostAllowedUserRow,
        PostAllowedUserRow,
        Partial<PostAllowedUserRow>,
        [Relationship<'post_id', 'activity_posts'>, Relationship<'user_id', 'profiles'>]
      >;
      reactions: TableShape<
        ReactionRow,
        Insertable<ReactionRow, 'post_id' | 'user_id' | 'reaction_type', 'id' | 'created_at'>,
        Partial<ReactionRow>,
        [Relationship<'post_id', 'activity_posts'>, Relationship<'user_id', 'profiles'>]
      >;
      comments: TableShape<
        CommentRow,
        Insertable<
          CommentRow,
          'post_id' | 'user_id' | 'body',
          'id' | 'is_hidden' | 'created_at' | 'updated_at'
        >,
        Partial<CommentRow>,
        [Relationship<'post_id', 'activity_posts'>, Relationship<'user_id', 'profiles'>]
      >;
      activity_photos: TableShape<
        ActivityPhotoRow,
        Insertable<
          ActivityPhotoRow,
          'post_id' | 'user_id' | 'storage_path',
          'id' | 'sort_order' | 'created_at'
        >,
        Partial<ActivityPhotoRow>,
        [Relationship<'post_id', 'activity_posts'>, Relationship<'user_id', 'profiles'>]
      >;
      daily_goals: TableShape<
        DailyGoalRow,
        Insertable<
          DailyGoalRow,
          'user_id' | 'goal_date' | 'target_seconds',
          'id' | 'created_at' | 'updated_at'
        >,
        Partial<DailyGoalRow>,
        [Relationship<'user_id', 'profiles'>]
      >;
      weekly_goals: TableShape<
        WeeklyGoalRow,
        Insertable<
          WeeklyGoalRow,
          'user_id' | 'week_start_date' | 'target_seconds',
          'id' | 'created_at' | 'updated_at'
        >,
        Partial<WeeklyGoalRow>,
        [Relationship<'user_id', 'profiles'>, Relationship<'category_id', 'categories'>]
      >;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      create_group: {
        Args: { p_name: string; p_description?: string | null };
        Returns: string;
      };
      accept_invitation: {
        Args: { p_token: string };
        Returns: string;
      };
      get_invitation_preview: {
        Args: { p_token: string };
        Returns: InvitationPreview[];
      };
      get_active_group_members: {
        Args: Record<PropertyKey, never>;
        Returns: ActiveGroupMember[];
      };
      set_comment_hidden: {
        Args: { p_comment_id: string; p_hidden: boolean };
        Returns: void;
      };
      start_session: {
        Args: { p_category_id: string; p_title?: string | null; p_note?: string | null };
        Returns: ActivitySessionRow;
      };
      pause_session: {
        Args: { p_session_id: string };
        Returns: ActivitySessionRow;
      };
      resume_session: {
        Args: { p_session_id: string };
        Returns: ActivitySessionRow;
      };
      complete_session: {
        Args: { p_session_id: string; p_ended_at?: string | null };
        Returns: ActivitySessionRow;
      };
      cancel_session: {
        Args: { p_session_id: string };
        Returns: void;
      };
      user_today: {
        Args: { p_user_id?: string };
        Returns: string;
      };
      create_activity_post: {
        Args: {
          p_category_id?: string | null;
          p_session_id?: string | null;
          p_title?: string | null;
          p_body?: string | null;
          p_duration_seconds?: number | null;
          p_activity_date?: string | null;
          p_visibility?: Visibility;
          p_group_id?: string | null;
          p_allowed_user_ids?: string[] | null;
        };
        Returns: string;
      };
      update_activity_post: {
        Args: {
          p_post_id: string;
          p_title?: string | null;
          p_body?: string | null;
          p_duration_seconds?: number | null;
          p_activity_date?: string | null;
          p_visibility?: Visibility;
          p_group_id?: string | null;
          p_allowed_user_ids?: string[] | null;
        };
        Returns: void;
      };
      delete_activity_post: {
        Args: { p_post_id: string };
        Returns: void;
      };
      user_week_start: {
        Args: { p_user_id?: string };
        Returns: string;
      };
      get_period_summary: {
        Args: { p_from: string; p_to: string };
        Returns: { total_seconds: number; post_count: number; active_days: number }[];
      };
      get_daily_totals: {
        Args: { p_from: string; p_to: string };
        Returns: { activity_date: string; total_seconds: number; post_count: number }[];
      };
      get_category_summary: {
        Args: { p_from: string; p_to: string };
        Returns: {
          category_id: string;
          category_name: string;
          category_icon: string;
          category_color: string;
          total_seconds: number;
          post_count: number;
        }[];
      };
      get_current_streak: {
        Args: { p_user_id?: string };
        Returns: number;
      };
      get_group_week_summary: {
        Args: { p_group_id: string; p_week_start?: string | null };
        Returns: {
          user_id: string;
          display_name: string;
          avatar_url: string | null;
          total_seconds: number;
          active_days: number;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
