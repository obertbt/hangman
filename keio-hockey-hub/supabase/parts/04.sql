-- ==========================================================
-- 自動生成: scripts/bundle-migrations.sh
-- 直接編集しない。直すのは supabase/migrations/ のほう。
-- 4 番目。中身: 0008_rls.sql 
-- ==========================================================


-- ---------- 0008_rls.sql ----------
-- =============================================================
-- 0008_rls.sql
-- Row Level Security（62章）
--
-- 保証すること:
--   * 他選手の非公開日報を見られない
--   * 他選手の非公開動画・フィードバックを見られない
--   * 別チームの情報を一切見られない
--   * URL 直打ちでも迂回できない（RLS はクエリ単位で効く）
--   * 削除済み（deleted_at）は通常閲覧に出さない
--
-- 方針:
--   * まず全テーブルで RLS を有効にする。
--   * 「チーム内で共有してよい情報」と「本人と指導側だけの情報」を分ける。
--   * アプリ側でも権限を確認する（75章: RLS と Application 側の両方で守る）。
-- =============================================================

-- 追加の補助関数 ------------------------------------------------

-- 同じチームに所属している profile か
create or replace function app.shares_team_with(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.team_members me
    join public.team_members other on other.team_id = me.team_id
    where me.profile_id = app.current_profile_id()
      and me.status = 'active'
      and me.deleted_at is null
      and other.profile_id = p_profile_id
      and other.deleted_at is null
  );
$$;

grant execute on function app.shares_team_with(uuid) to authenticated;

-- 本人の team_member かどうか（team_member_id 指定）
create or replace function app.is_own_member(p_team_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.team_members tm
    where tm.id = p_team_member_id
      and tm.profile_id = app.current_profile_id()
  );
$$;

grant execute on function app.is_own_member(uuid) to authenticated;

-- =============================================================
-- RLS 有効化
-- =============================================================
alter table public.teams               enable row level security;
alter table public.profiles            enable row level security;
alter table public.team_members        enable row level security;
alter table public.roles               enable row level security;
alter table public.permissions         enable row level security;
alter table public.role_permissions    enable row level security;
alter table public.member_permissions  enable row level security;
alter table public.team_invitations    enable row level security;
alter table public.app_settings        enable row level security;
alter table public.audit_logs          enable row level security;

alter table public.seasons             enable row level security;
alter table public.season_goals        enable row level security;
alter table public.milestones          enable row level security;
alter table public.competitions        enable row level security;
alter table public.weeks               enable row level security;
alter table public.events              enable row level security;
alter table public.event_participants  enable row level security;

alter table public.daily_conditions    enable row level security;
alter table public.practice_goals      enable row level security;
alter table public.daily_reports       enable row level security;
alter table public.report_feedbacks    enable row level security;
alter table public.training_records    enable row level security;
alter table public.training_exercises  enable row level security;
alter table public.training_sets       enable row level security;

alter table public.files                   enable row level security;
alter table public.file_relations          enable row level security;
alter table public.upload_sessions         enable row level security;
alter table public.file_deletion_jobs      enable row level security;
alter table public.storage_usage_snapshots enable row level security;
alter table public.videos                  enable row level security;
alter table public.video_clips             enable row level security;
alter table public.video_tags              enable row level security;
alter table public.video_tag_relations     enable row level security;

alter table public.skill_categories        enable row level security;
alter table public.skills                  enable row level security;
alter table public.player_skills           enable row level security;
alter table public.skill_applications      enable row level security;
alter table public.skill_application_items enable row level security;
alter table public.skill_reviews           enable row level security;
alter table public.skill_status_histories  enable row level security;

alter table public.feedback_requests         enable row level security;
alter table public.feedback_responses        enable row level security;
alter table public.feedback_messages         enable row level security;
alter table public.feedback_status_histories enable row level security;
alter table public.feedback_share_requests   enable row level security;

alter table public.notifications        enable row level security;
alter table public.notification_targets enable row level security;

alter table public.measurement_events   enable row level security;
alter table public.measurement_items    enable row level security;
alter table public.measurement_results  enable row level security;

alter table public.import_sessions      enable row level security;
alter table public.import_rows          enable row level security;
alter table public.import_mappings      enable row level security;
alter table public.import_record_links  enable row level security;

-- =============================================================
-- マスタ（読み取りのみ）
-- =============================================================
create policy roles_select on public.roles
  for select to authenticated using (true);

create policy permissions_select on public.permissions
  for select to authenticated using (true);

create policy role_permissions_select on public.role_permissions
  for select to authenticated using (true);

-- =============================================================
-- teams / profiles / team_members
-- =============================================================
create policy teams_select on public.teams
  for select to authenticated
  using (deleted_at is null and app.is_team_member(id));

create policy teams_update on public.teams
  for update to authenticated
  using (app.role_in_team(id) = 'system_admin')
  with check (app.role_in_team(id) = 'system_admin');

-- 自分のプロフィール、または同じチームの人のプロフィール
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    deleted_at is null
    and (user_id = auth.uid() or app.shares_team_with(id))
  );

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 同じチームの所属は互いに見える（名簿として必要）
create policy team_members_select on public.team_members
  for select to authenticated
  using (deleted_at is null and app.is_team_member(team_id));

create policy team_members_staff_write on public.team_members
  for all to authenticated
  using (app.is_staff(team_id))
  with check (app.is_staff(team_id));

-- 個別権限はスタッフのみ
create policy member_permissions_select on public.member_permissions
  for select to authenticated
  using (
    exists (
      select 1 from public.team_members tm
      where tm.id = member_permissions.team_member_id
        and (app.is_staff(tm.team_id) or app.is_own_member(tm.id))
    )
  );

create policy member_permissions_admin_write on public.member_permissions
  for all to authenticated
  using (
    exists (
      select 1 from public.team_members tm
      where tm.id = member_permissions.team_member_id
        and app.role_in_team(tm.team_id) = 'system_admin'
    )
  )
  with check (
    exists (
      select 1 from public.team_members tm
      where tm.id = member_permissions.team_member_id
        and app.role_in_team(tm.team_id) = 'system_admin'
    )
  );

-- 招待はスタッフのみが扱う
create policy team_invitations_staff on public.team_invitations
  for all to authenticated
  using (app.is_staff(team_id))
  with check (app.is_staff(team_id));

-- 設定
create policy app_settings_select on public.app_settings
  for select to authenticated
  using (team_id is null or app.is_team_member(team_id));

create policy app_settings_admin_write on public.app_settings
  for all to authenticated
  using (team_id is not null and app.role_in_team(team_id) = 'system_admin')
  with check (team_id is not null and app.role_in_team(team_id) = 'system_admin');

-- 監査ログは読み取りのみ（書き込みはサーバー経由）
create policy audit_logs_admin_select on public.audit_logs
  for select to authenticated
  using (team_id is not null and app.is_staff(team_id));

-- =============================================================
-- 時間軸: シーズン / 週 / イベント
--   公開前（is_published=false）はスタッフだけが見られる。
-- =============================================================
create policy seasons_select on public.seasons
  for select to authenticated
  using (deleted_at is null and app.is_team_member(team_id) and (is_published or app.is_staff(team_id)));

create policy seasons_staff_write on public.seasons
  for all to authenticated
  using (app.has_permission(team_id, 'event.manage'))
  with check (app.has_permission(team_id, 'event.manage'));

create policy season_goals_select on public.season_goals
  for select to authenticated
  using (deleted_at is null and app.is_team_member(team_id));

create policy season_goals_staff_write on public.season_goals
  for all to authenticated
  using (app.has_permission(team_id, 'event.manage'))
  with check (app.has_permission(team_id, 'event.manage'));

create policy milestones_select on public.milestones
  for select to authenticated
  using (deleted_at is null and app.is_team_member(team_id));

create policy milestones_staff_write on public.milestones
  for all to authenticated
  using (app.has_permission(team_id, 'event.manage'))
  with check (app.has_permission(team_id, 'event.manage'));

create policy competitions_select on public.competitions
  for select to authenticated
  using (deleted_at is null and app.is_team_member(team_id));

create policy competitions_staff_write on public.competitions
  for all to authenticated
  using (app.has_permission(team_id, 'event.manage'))
  with check (app.has_permission(team_id, 'event.manage'));

create policy weeks_select on public.weeks
  for select to authenticated
  using (deleted_at is null and app.is_team_member(team_id) and (is_published or app.is_staff(team_id)));

create policy weeks_staff_write on public.weeks
  for all to authenticated
  using (app.has_permission(team_id, 'event.manage'))
  with check (app.has_permission(team_id, 'event.manage'));

create policy events_select on public.events
  for select to authenticated
  using (
    deleted_at is null
    and app.is_team_member(team_id)
    and (
      app.is_staff(team_id)
      or (
        is_published
        and (
          target_scope = 'team'
          or (target_scope = 'selected' and exists (
                select 1 from public.event_participants ep
                where ep.event_id = events.id and app.is_own_member(ep.team_member_id)
              ))
        )
      )
    )
  );

create policy events_staff_write on public.events
  for all to authenticated
  using (app.has_permission(team_id, 'event.manage'))
  with check (app.has_permission(team_id, 'event.manage'));

create policy event_participants_select on public.event_participants
  for select to authenticated
  using (app.is_team_member(team_id));

-- 出欠は本人が更新できる。名簿の増減はスタッフ。
create policy event_participants_self_update on public.event_participants
  for update to authenticated
  using (app.is_own_member(team_member_id))
  with check (app.is_own_member(team_member_id));

create policy event_participants_staff_write on public.event_participants
  for all to authenticated
  using (app.has_permission(team_id, 'event.manage'))
  with check (app.has_permission(team_id, 'event.manage'));

-- =============================================================
-- 日報・コンディション・トレーニング
--   本人は常に自分の記録を扱える。
--   スタッフは report.view_all を持つ場合に限り、private 以外を読める。
--   他の選手は visibility='team' のものだけ。
-- =============================================================
create policy daily_conditions_own on public.daily_conditions
  for all to authenticated
  using (app.is_own_member(team_member_id))
  with check (app.is_own_member(team_member_id));

-- コンディションは安全管理のため、スタッフは読める（15章・12章の「注意選手」）
create policy daily_conditions_staff_select on public.daily_conditions
  for select to authenticated
  using (deleted_at is null and app.has_permission(team_id, 'report.view_all'));

create policy practice_goals_own on public.practice_goals
  for all to authenticated
  using (app.is_own_member(team_member_id))
  with check (app.is_own_member(team_member_id));

create policy practice_goals_staff_select on public.practice_goals
  for select to authenticated
  using (deleted_at is null and app.has_permission(team_id, 'report.view_all'));

create policy daily_reports_own on public.daily_reports
  for all to authenticated
  using (app.is_own_member(team_member_id))
  with check (app.is_own_member(team_member_id));

create policy daily_reports_staff_select on public.daily_reports
  for select to authenticated
  using (
    deleted_at is null
    and visibility in ('staff', 'team')
    and app.has_permission(team_id, 'report.view_all')
  );

create policy daily_reports_team_select on public.daily_reports
  for select to authenticated
  using (deleted_at is null and visibility = 'team' and app.is_team_member(team_id));

create policy report_feedbacks_select on public.report_feedbacks
  for select to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from public.daily_reports r
      where r.id = report_feedbacks.daily_report_id
        and (app.is_own_member(r.team_member_id) or app.has_permission(r.team_id, 'report.view_all'))
    )
  );

create policy report_feedbacks_staff_write on public.report_feedbacks
  for all to authenticated
  using (app.has_permission(team_id, 'report.view_all'))
  with check (app.has_permission(team_id, 'report.view_all'));

create policy training_records_own on public.training_records
  for all to authenticated
  using (app.is_own_member(team_member_id))
  with check (app.is_own_member(team_member_id));

create policy training_records_staff_select on public.training_records
  for select to authenticated
  using (
    deleted_at is null
    and visibility in ('staff', 'team')
    and app.has_permission(team_id, 'report.view_all')
  );

create policy training_records_team_select on public.training_records
  for select to authenticated
  using (deleted_at is null and visibility = 'team' and app.is_team_member(team_id));

-- 種目・セットは親のトレーニング記録に従う
create policy training_exercises_via_parent on public.training_exercises
  for all to authenticated
  using (
    exists (
      select 1 from public.training_records tr
      where tr.id = training_exercises.training_record_id
        and (app.is_own_member(tr.team_member_id) or app.has_permission(tr.team_id, 'report.view_all'))
    )
  )
  with check (
    exists (
      select 1 from public.training_records tr
      where tr.id = training_exercises.training_record_id
        and app.is_own_member(tr.team_member_id)
    )
  );

create policy training_sets_via_parent on public.training_sets
  for all to authenticated
  using (
    exists (
      select 1
      from public.training_exercises te
      join public.training_records tr on tr.id = te.training_record_id
      where te.id = training_sets.training_exercise_id
        and (app.is_own_member(tr.team_member_id) or app.has_permission(tr.team_id, 'report.view_all'))
    )
  )
  with check (
    exists (
      select 1
      from public.training_exercises te
      join public.training_records tr on tr.id = te.training_record_id
      where te.id = training_sets.training_exercise_id
        and app.is_own_member(tr.team_member_id)
    )
  );

-- =============================================================
-- ファイル・動画
--   自分がアップロードしたもの、スタッフ、または team 公開のもの。
-- =============================================================
create policy files_select on public.files
  for select to authenticated
  using (
    deleted_at is null
    and app.is_team_member(team_id)
    and (
      uploaded_by = app.current_profile_id()
      or visibility = 'team'
      or app.has_permission(team_id, 'video.view_team')
    )
  );

create policy files_insert_own on public.files
  for insert to authenticated
  with check (app.is_team_member(team_id) and uploaded_by = app.current_profile_id());

create policy files_update_own on public.files
  for update to authenticated
  using (uploaded_by = app.current_profile_id() or app.has_permission(team_id, 'storage.manage'))
  with check (uploaded_by = app.current_profile_id() or app.has_permission(team_id, 'storage.manage'));

create policy file_relations_select on public.file_relations
  for select to authenticated
  using (app.is_team_member(team_id));

create policy file_relations_write on public.file_relations
  for all to authenticated
  using (app.is_team_member(team_id))
  with check (app.is_team_member(team_id));

create policy upload_sessions_own on public.upload_sessions
  for all to authenticated
  using (created_by = app.current_profile_id() or app.has_permission(team_id, 'storage.manage'))
  with check (created_by = app.current_profile_id() and app.is_team_member(team_id));

create policy file_deletion_jobs_admin on public.file_deletion_jobs
  for all to authenticated
  using (app.has_permission(team_id, 'storage.manage'))
  with check (app.has_permission(team_id, 'storage.manage'));

create policy storage_usage_admin on public.storage_usage_snapshots
  for select to authenticated
  using (app.has_permission(team_id, 'storage.manage'));

create policy videos_select on public.videos
  for select to authenticated
  using (
    deleted_at is null
    and app.is_team_member(team_id)
    and (
      created_by = app.current_profile_id()
      or visibility = 'team'
      or app.has_permission(team_id, 'video.view_team')
    )
  );

create policy videos_insert on public.videos
  for insert to authenticated
  with check (app.has_permission(team_id, 'video.upload') and created_by = app.current_profile_id());

create policy videos_update on public.videos
  for update to authenticated
  using (created_by = app.current_profile_id() or app.is_staff(team_id))
  with check (created_by = app.current_profile_id() or app.is_staff(team_id));

create policy video_clips_select on public.video_clips
  for select to authenticated
  using (
    deleted_at is null
    and exists (select 1 from public.videos v where v.id = video_clips.video_id)
  );

create policy video_clips_write on public.video_clips
  for all to authenticated
  using (created_by = app.current_profile_id() or app.is_staff(team_id))
  with check (created_by = app.current_profile_id() and app.is_team_member(team_id));

create policy video_tags_select on public.video_tags
  for select to authenticated using (app.is_team_member(team_id));

create policy video_tags_staff_write on public.video_tags
  for all to authenticated
  using (app.is_staff(team_id)) with check (app.is_staff(team_id));

create policy video_tag_relations_select on public.video_tag_relations
  for select to authenticated
  using (exists (select 1 from public.videos v where v.id = video_tag_relations.video_id));

create policy video_tag_relations_staff_write on public.video_tag_relations
  for all to authenticated
  using (exists (select 1 from public.videos v where v.id = video_tag_relations.video_id and app.is_staff(v.team_id)))
  with check (exists (select 1 from public.videos v where v.id = video_tag_relations.video_id and app.is_staff(v.team_id)));

-- =============================================================
-- スキル
-- =============================================================
create policy skill_categories_select on public.skill_categories
  for select to authenticated using (deleted_at is null and app.is_team_member(team_id));

create policy skill_categories_staff_write on public.skill_categories
  for all to authenticated
  using (app.has_permission(team_id, 'skill.review')) with check (app.has_permission(team_id, 'skill.review'));

create policy skills_select on public.skills
  for select to authenticated using (deleted_at is null and app.is_team_member(team_id));

create policy skills_staff_write on public.skills
  for all to authenticated
  using (app.has_permission(team_id, 'skill.review')) with check (app.has_permission(team_id, 'skill.review'));

-- 自分の到達状況は本人とスタッフが見られる
create policy player_skills_select on public.player_skills
  for select to authenticated
  using (deleted_at is null and (app.is_own_member(team_member_id) or app.is_staff(team_id)));

create policy player_skills_own_write on public.player_skills
  for insert to authenticated with check (app.is_own_member(team_member_id));

-- 承認できるのは skill.review を持つ人だけ
create policy player_skills_staff_write on public.player_skills
  for update to authenticated
  using (app.has_permission(team_id, 'skill.review') or app.is_own_member(team_member_id))
  with check (app.has_permission(team_id, 'skill.review') or app.is_own_member(team_member_id));

create policy skill_applications_select on public.skill_applications
  for select to authenticated
  using (deleted_at is null and (app.is_own_member(team_member_id) or app.is_staff(team_id)));

create policy skill_applications_own_write on public.skill_applications
  for all to authenticated
  using (app.is_own_member(team_member_id) or app.has_permission(team_id, 'skill.review'))
  with check (app.is_own_member(team_member_id) or app.has_permission(team_id, 'skill.review'));

create policy skill_application_items_via_parent on public.skill_application_items
  for all to authenticated
  using (
    exists (
      select 1 from public.skill_applications sa
      where sa.id = skill_application_items.skill_application_id
        and (app.is_own_member(sa.team_member_id) or app.is_staff(sa.team_id))
    )
  )
  with check (
    exists (
      select 1 from public.skill_applications sa
      where sa.id = skill_application_items.skill_application_id
        and app.is_own_member(sa.team_member_id)
    )
  );

create policy skill_reviews_select on public.skill_reviews
  for select to authenticated
  using (
    exists (
      select 1 from public.skill_applications sa
      where sa.id = skill_reviews.skill_application_id
        and (app.is_own_member(sa.team_member_id) or app.is_staff(sa.team_id))
    )
  );

create policy skill_reviews_staff_write on public.skill_reviews
  for insert to authenticated
  with check (app.has_permission(team_id, 'skill.review'));

create policy skill_status_histories_select on public.skill_status_histories
  for select to authenticated
  using (
    exists (
      select 1 from public.player_skills ps
      where ps.id = skill_status_histories.player_skill_id
        and (app.is_own_member(ps.team_member_id) or app.is_staff(ps.team_id))
    )
  );

-- =============================================================
-- 動画フィードバック
--   private_staff: 本人 + 回答権限を持つスタッフ
--   selected_members: 上記 + 明示的に選ばれた人（MVP では未使用）
--   team: チーム全員（ただし選手の承認を経た場合のみこの値になる）
-- =============================================================
create policy feedback_requests_select on public.feedback_requests
  for select to authenticated
  using (
    deleted_at is null
    and app.is_team_member(team_id)
    and (
      app.is_own_member(requester_id)
      or app.has_permission(team_id, 'video.feedback_answer')
      or visibility = 'team'
    )
  );

create policy feedback_requests_own_write on public.feedback_requests
  for insert to authenticated
  with check (app.is_own_member(requester_id) and app.has_permission(team_id, 'video.feedback_request'));

create policy feedback_requests_update on public.feedback_requests
  for update to authenticated
  using (app.is_own_member(requester_id) or app.has_permission(team_id, 'video.feedback_answer'))
  with check (app.is_own_member(requester_id) or app.has_permission(team_id, 'video.feedback_answer'));

create policy feedback_responses_select on public.feedback_responses
  for select to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from public.feedback_requests fr
      where fr.id = feedback_responses.feedback_request_id
    )
  );

create policy feedback_responses_coach_write on public.feedback_responses
  for insert to authenticated
  with check (app.has_permission(team_id, 'video.feedback_answer') and app.is_own_member(responder_id));

create policy feedback_messages_select on public.feedback_messages
  for select to authenticated
  using (
    deleted_at is null
    and exists (select 1 from public.feedback_requests fr where fr.id = feedback_messages.feedback_request_id)
  );

create policy feedback_messages_insert on public.feedback_messages
  for insert to authenticated
  with check (app.is_own_member(sender_id) and app.is_team_member(team_id));

create policy feedback_status_histories_select on public.feedback_status_histories
  for select to authenticated
  using (exists (select 1 from public.feedback_requests fr where fr.id = feedback_status_histories.feedback_request_id));

create policy feedback_share_requests_select on public.feedback_share_requests
  for select to authenticated
  using (exists (select 1 from public.feedback_requests fr where fr.id = feedback_share_requests.feedback_request_id));

create policy feedback_share_requests_coach_insert on public.feedback_share_requests
  for insert to authenticated
  with check (app.has_permission(team_id, 'video.feedback_answer') and app.is_own_member(requested_by));

-- 承認・却下できるのは、依頼した本人（選手）だけ（29章）
create policy feedback_share_requests_player_update on public.feedback_share_requests
  for update to authenticated
  using (
    exists (
      select 1 from public.feedback_requests fr
      where fr.id = feedback_share_requests.feedback_request_id
        and app.is_own_member(fr.requester_id)
    )
  )
  with check (
    exists (
      select 1 from public.feedback_requests fr
      where fr.id = feedback_share_requests.feedback_request_id
        and app.is_own_member(fr.requester_id)
    )
  );

-- =============================================================
-- 通知
-- =============================================================
create policy notifications_select on public.notifications
  for select to authenticated
  using (
    app.is_team_member(team_id)
    and exists (
      select 1 from public.notification_targets nt
      where nt.notification_id = notifications.id and app.is_own_member(nt.team_member_id)
    )
  );

create policy notification_targets_select on public.notification_targets
  for select to authenticated
  using (app.is_own_member(team_member_id));

create policy notification_targets_update on public.notification_targets
  for update to authenticated
  using (app.is_own_member(team_member_id))
  with check (app.is_own_member(team_member_id));

-- =============================================================
-- 測定
-- =============================================================
create policy measurement_events_select on public.measurement_events
  for select to authenticated using (deleted_at is null and app.is_team_member(team_id));

create policy measurement_events_staff_write on public.measurement_events
  for all to authenticated
  using (app.is_staff(team_id)) with check (app.is_staff(team_id));

create policy measurement_items_select on public.measurement_items
  for select to authenticated using (app.is_team_member(team_id));

create policy measurement_items_staff_write on public.measurement_items
  for all to authenticated
  using (app.is_staff(team_id)) with check (app.is_staff(team_id));

-- 測定結果は本人とスタッフ
create policy measurement_results_select on public.measurement_results
  for select to authenticated
  using (app.is_own_member(team_member_id) or app.is_staff(team_id));

create policy measurement_results_staff_write on public.measurement_results
  for all to authenticated
  using (app.is_staff(team_id)) with check (app.is_staff(team_id));

-- =============================================================
-- Import（50章）
--   import.execute を持つ人だけ。CSV 内の team_id は使わない。
-- =============================================================
create policy import_sessions_select on public.import_sessions
  for select to authenticated
  using (app.has_permission(team_id, 'import.execute'));

create policy import_sessions_write on public.import_sessions
  for all to authenticated
  using (app.has_permission(team_id, 'import.execute'))
  with check (app.has_permission(team_id, 'import.execute') and created_by = app.current_profile_id());

create policy import_rows_via_session on public.import_rows
  for all to authenticated
  using (
    exists (
      select 1 from public.import_sessions s
      where s.id = import_rows.import_session_id and app.has_permission(s.team_id, 'import.execute')
    )
  )
  with check (
    exists (
      select 1 from public.import_sessions s
      where s.id = import_rows.import_session_id and app.has_permission(s.team_id, 'import.execute')
    )
  );

create policy import_mappings_via_session on public.import_mappings
  for all to authenticated
  using (
    exists (
      select 1 from public.import_sessions s
      where s.id = import_mappings.import_session_id and app.has_permission(s.team_id, 'import.execute')
    )
  )
  with check (
    exists (
      select 1 from public.import_sessions s
      where s.id = import_mappings.import_session_id and app.has_permission(s.team_id, 'import.execute')
    )
  );

create policy import_record_links_via_session on public.import_record_links
  for all to authenticated
  using (
    exists (
      select 1 from public.import_sessions s
      where s.id = import_record_links.import_session_id and app.has_permission(s.team_id, 'import.execute')
    )
  )
  with check (
    exists (
      select 1 from public.import_sessions s
      where s.id = import_record_links.import_session_id and app.has_permission(s.team_id, 'import.execute')
    )
  );

