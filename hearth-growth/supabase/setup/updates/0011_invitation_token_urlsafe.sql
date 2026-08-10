-- Hearth Growth : 0011_invitation_token_urlsafe.sql だけを実行する
-- すでに動いている環境へ、この変更ぶんだけを足すためのファイルです。
-- まっさらな状態から作る場合は supabase/setup/ の 01 から順に実行してください。

alter table public.group_invitations
  alter column token set default translate(
    encode(gen_random_bytes(32), 'base64'),
    '+/=',
    '-_'
  );

update public.group_invitations
set token = rtrim(token, '=')
where token like '%=';
