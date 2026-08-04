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

interface TableShape<Row, Insert, Update> {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
}

export interface ProfileRow {
  id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  timezone: string;
  default_visibility: Visibility;
  created_at: string;
  updated_at: string;
}

export interface GroupRow {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface GroupMemberRow {
  id: string;
  group_id: string;
  user_id: string;
  role: GroupRole;
  joined_at: string;
}

export interface GroupInvitationRow {
  id: string;
  group_id: string;
  token: string;
  invited_by: string;
  expires_at: string;
  max_uses: number;
  used_count: number;
  revoked_at: string | null;
  created_at: string;
}

export interface CategoryRow {
  id: string;
  user_id: string | null;
  group_id: string | null;
  name: string;
  icon: string;
  color: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface ActivitySessionRow {
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
}

export interface ActivityPostRow {
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
}

export interface PostAllowedUserRow {
  post_id: string;
  user_id: string;
}

export interface ReactionRow {
  id: string;
  post_id: string;
  user_id: string;
  reaction_type: ReactionType;
  created_at: string;
}

export interface CommentRow {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  is_hidden: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface DailyGoalRow {
  id: string;
  user_id: string;
  goal_date: string;
  target_seconds: number;
  message: string | null;
  created_at: string;
  updated_at: string;
}

export interface WeeklyGoalRow {
  id: string;
  user_id: string;
  week_start_date: string;
  category_id: string | null;
  target_seconds: number;
  message: string | null;
  created_at: string;
  updated_at: string;
}

/** get_active_group_members() の戻り値 */
export interface ActiveGroupMember {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  category_name: string;
  category_icon: string;
  category_color: string;
  status: Extract<SessionStatus, 'running' | 'paused'>;
  started_at: string;
  total_paused_seconds: number;
}

/** get_invitation_preview() の戻り値 */
export interface InvitationPreview {
  group_id: string | null;
  group_name: string | null;
  inviter_name: string | null;
  member_count: number;
  is_valid: boolean;
  reason: 'ok' | 'not_found' | 'expired' | 'revoked' | 'exhausted';
}

type Insertable<Row, Required extends keyof Row, Generated extends keyof Row> = Pick<Row, Required> &
  Partial<Omit<Row, Required | Generated>> &
  Partial<Pick<Row, Generated>>;

export interface Database {
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
        Partial<GroupRow>
      >;
      group_members: TableShape<
        GroupMemberRow,
        Insertable<GroupMemberRow, 'group_id' | 'user_id', 'id' | 'joined_at'>,
        Partial<GroupMemberRow>
      >;
      group_invitations: TableShape<
        GroupInvitationRow,
        Insertable<
          GroupInvitationRow,
          'group_id' | 'invited_by',
          'id' | 'token' | 'expires_at' | 'max_uses' | 'used_count' | 'created_at'
        >,
        Partial<GroupInvitationRow>
      >;
      categories: TableShape<
        CategoryRow,
        Insertable<CategoryRow, 'name', 'id' | 'icon' | 'color' | 'sort_order' | 'is_active' | 'created_at'>,
        Partial<CategoryRow>
      >;
      activity_sessions: TableShape<
        ActivitySessionRow,
        Insertable<
          ActivitySessionRow,
          'user_id' | 'category_id',
          'id' | 'status' | 'started_at' | 'total_paused_seconds' | 'created_at' | 'updated_at'
        >,
        Partial<ActivitySessionRow>
      >;
      activity_posts: TableShape<
        ActivityPostRow,
        Insertable<
          ActivityPostRow,
          'user_id' | 'category_id' | 'duration_seconds' | 'activity_date',
          'id' | 'visibility' | 'created_at' | 'updated_at'
        >,
        Partial<ActivityPostRow>
      >;
      post_allowed_users: TableShape<PostAllowedUserRow, PostAllowedUserRow, Partial<PostAllowedUserRow>>;
      reactions: TableShape<
        ReactionRow,
        Insertable<ReactionRow, 'post_id' | 'user_id' | 'reaction_type', 'id' | 'created_at'>,
        Partial<ReactionRow>
      >;
      comments: TableShape<
        CommentRow,
        Insertable<
          CommentRow,
          'post_id' | 'user_id' | 'body',
          'id' | 'is_hidden' | 'created_at' | 'updated_at'
        >,
        Partial<CommentRow>
      >;
      daily_goals: TableShape<
        DailyGoalRow,
        Insertable<
          DailyGoalRow,
          'user_id' | 'goal_date' | 'target_seconds',
          'id' | 'created_at' | 'updated_at'
        >,
        Partial<DailyGoalRow>
      >;
      weekly_goals: TableShape<
        WeeklyGoalRow,
        Insertable<
          WeeklyGoalRow,
          'user_id' | 'week_start_date' | 'target_seconds',
          'id' | 'created_at' | 'updated_at'
        >,
        Partial<WeeklyGoalRow>
      >;
    };
    Views: Record<never, never>;
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
        Args: Record<string, never>;
        Returns: ActiveGroupMember[];
      };
      set_comment_hidden: {
        Args: { p_comment_id: string; p_hidden: boolean };
        Returns: void;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}
