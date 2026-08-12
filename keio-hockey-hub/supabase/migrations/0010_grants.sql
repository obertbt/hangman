-- =============================================================
-- 0010_grants.sql
-- テーブル権限。
--
-- Supabase は既定で public スキーマの新規テーブルを anon / authenticated へ
-- 付与するが、環境差で挙動が変わると RLS の検証結果も変わってしまう。
-- ここで明示的に「ログイン済みだけ」に揃える。
--
-- 行の見え方は RLS が決める。ここで与えるのはテーブルへの到達可否だけ。
-- =============================================================

-- 未ログイン（anon）は public のデータに一切触れない。
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- 監査ログとマスタは読み取りだけにする（書き込みはサーバー経由）。
revoke insert, update, delete on public.audit_logs from authenticated;
revoke insert, update, delete on public.roles from authenticated;
revoke insert, update, delete on public.permissions from authenticated;
revoke insert, update, delete on public.role_permissions from authenticated;

-- 以後に追加されるテーブルにも同じ既定を適用する。
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;
