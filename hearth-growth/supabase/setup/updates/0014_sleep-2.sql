-- Hearth Growth : 0014_sleep.sql だけを実行する（2 / 2）
-- すでに動いている環境へ、この変更ぶんだけを足すためのファイルです。
-- まっさらな状態から作る場合は supabase/setup/ の 01 から順に実行してください。

revoke all on function public.start_sleep() from public, anon;
revoke all on function public.wake_up() from public, anon;
grant execute on function public.start_sleep() to authenticated;
grant execute on function public.wake_up() to authenticated;
