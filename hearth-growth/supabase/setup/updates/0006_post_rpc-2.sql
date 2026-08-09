-- Hearth Growth : 0006_post_rpc.sql だけを実行する（2 / 2）
-- すでに動いている環境へ、この変更ぶんだけを足すためのファイルです。
-- まっさらな状態から作る場合は supabase/setup/ の 01 から順に実行してください。

grant execute on function public.create_activity_post(uuid, uuid, text, text, integer, date, text, uuid, uuid[])
  to authenticated;
grant execute on function public.update_activity_post(uuid, text, text, integer, date, text, uuid, uuid[])
  to authenticated;
grant execute on function public.delete_activity_post(uuid) to authenticated;
grant execute on function public.assert_visibility_target(uuid, text, uuid, uuid[]) to authenticated;
