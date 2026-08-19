-- 仕上がりの確認用。テーブル 18 / RLS が有効なテーブル 18 になっていれば成功です。
-- 関数の数とポリシー数は環境によって前後します（20 以上あれば問題ありません）。
select
  (select count(*) from pg_tables where schemaname = 'public')                    as テーブル数,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public')                                                   as 関数の数,
  (select count(*) from pg_tables where schemaname = 'public' and rowsecurity)    as RLSが有効なテーブル数,
  (select count(*) from pg_policies where schemaname = 'public')                  as ポリシー数;
