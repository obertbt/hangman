-- =============================================================
-- 0009_master_data.sql
-- ロールと権限のマスタ（13章）。
-- これはアプリの動作に必須なので seed ではなく migration に置く。
-- =============================================================

insert into public.roles (code, label_ja, description, sort_order) values
  ('system_admin', '管理者',       'すべての操作ができる',                 10),
  ('coach',        'コーチ',       '指導・フィードバック・承認を行う',     20),
  ('manager',      'マネージャー', '予定や記録の管理を行う',               30),
  ('player',       '選手',         '自分の記録と質問を行う',               40)
on conflict (code) do update
  set label_ja = excluded.label_ja,
      description = excluded.description,
      sort_order = excluded.sort_order;

insert into public.permissions (code, label_ja, description) values
  ('video.upload',           '動画を投稿する',           '短編動画のアップロードと YouTube 動画の登録'),
  ('video.view_team',        'チームの動画を見る',       'チーム内で共有された動画の閲覧'),
  ('video.feedback_request', '動画で質問する',           'フィードバック依頼の作成'),
  ('video.feedback_answer',  '動画の質問に答える',       'フィードバック依頼への回答・担当割り当て'),
  ('skill.review',           'スキルを審査する',         'スキル申請の承認・却下とスキル定義の編集'),
  ('report.view_all',        '全員の日報を見る',         'staff 公開以上の日報・トレーニング記録の閲覧'),
  ('event.manage',           '予定を管理する',           'シーズン・週・イベントの作成と編集'),
  ('import.execute',         'データ移行を実行する',     'Import Center の利用'),
  ('storage.manage',         '保存容量を管理する',       '容量集計とファイルの物理削除')
on conflict (code) do update
  set label_ja = excluded.label_ja,
      description = excluded.description;

-- 役割ごとの既定権限 ------------------------------------------

-- 管理者: すべて
insert into public.role_permissions (role_code, permission_code)
select 'system_admin', code from public.permissions
on conflict do nothing;

-- コーチ: 指導に必要なものすべて。データ移行は既定では持たせない。
insert into public.role_permissions (role_code, permission_code) values
  ('coach', 'video.upload'),
  ('coach', 'video.view_team'),
  ('coach', 'video.feedback_request'),
  ('coach', 'video.feedback_answer'),
  ('coach', 'skill.review'),
  ('coach', 'report.view_all'),
  ('coach', 'event.manage')
on conflict do nothing;

-- マネージャー: 予定と記録の管理。回答や承認はしない。
insert into public.role_permissions (role_code, permission_code) values
  ('manager', 'video.upload'),
  ('manager', 'video.view_team'),
  ('manager', 'report.view_all'),
  ('manager', 'event.manage')
on conflict do nothing;

-- 選手: 自分の記録と質問
insert into public.role_permissions (role_code, permission_code) values
  ('player', 'video.upload'),
  ('player', 'video.view_team'),
  ('player', 'video.feedback_request')
on conflict do nothing;
