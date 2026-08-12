-- =============================================================
-- 0012_video_visibility_fix.sql
--
-- 動画とファイルの公開範囲が効いていなかったのを直す。
--
-- 見つかった問題:
--   videos / files のポリシーが「video.view_team を持っていれば見える」
--   になっていた。しかし video.view_team は選手にも既定で付いている
--   （13章の「チームの動画を見る」）。
--   結果として、公開範囲を private_staff にしても、
--   同じチームの選手全員から見えてしまっていた。
--
--   選手が自分の失敗を全員に見られる前提だと、動画で質問しなくなる。
--   29章で「コーチが一方的に team 公開へ変えられない」ようにした意味も無くなる。
--
-- 直し方:
--   権限の意味を、名前のとおりに使い分ける。
--     video.view_team      … チームへ共有された動画を見る
--     video.feedback_answer … 回答するために、本人の非公開動画も見る
--
--   つまり private_staff は「本人 + 回答権限を持つスタッフ」になる
--   （docs/permissions.md の表と一致させる）。
-- =============================================================

drop policy if exists videos_select on public.videos;

create policy videos_select on public.videos
  for select to authenticated
  using (
    deleted_at is null
    and app.is_team_member(team_id)
    and (
      -- 自分が登録したもの
      created_by = app.current_profile_id()
      -- チームへ共有されたもの
      or (visibility = 'team' and app.has_permission(team_id, 'video.view_team'))
      -- 回答するために見る必要があるスタッフ
      or app.has_permission(team_id, 'video.feedback_answer')
      -- 容量管理のために全体を見る必要がある人
      or app.has_permission(team_id, 'storage.manage')
    )
  );

drop policy if exists files_select on public.files;

create policy files_select on public.files
  for select to authenticated
  using (
    deleted_at is null
    and app.is_team_member(team_id)
    and (
      uploaded_by = app.current_profile_id()
      or (visibility = 'team' and app.has_permission(team_id, 'video.view_team'))
      or app.has_permission(team_id, 'video.feedback_answer')
      or app.has_permission(team_id, 'storage.manage')
    )
  );

-- -------------------------------------------------------------
-- 仮想クリップも、元動画が見えるときだけ見えるようにする。
--
-- これまでは「videos に行があること」だけを見ていた。
-- 上のポリシーで videos 自体が絞られるため実害は無くなるが、
-- 意図をはっきりさせるために条件を書き直す。
-- -------------------------------------------------------------
drop policy if exists video_clips_select on public.video_clips;

create policy video_clips_select on public.video_clips
  for select to authenticated
  using (
    deleted_at is null
    and app.is_team_member(team_id)
    and exists (
      -- videos 側の RLS が効くので、見てよい動画のクリップだけが残る
      select 1 from public.videos v where v.id = video_clips.video_id
    )
  );
