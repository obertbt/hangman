-- =============================================================
-- 0023_submission_status.sql
-- 「出したこと」と「中身」を分ける（12章・16章）。
--
-- 積み残していた問題:
--   公開範囲を「自分だけ」にした日報が、
--   コーチの提出状況では**未提出に見えていた**。
--
--   RLS は行が見えるか見えないかしか決められない。
--   「あることは見せるが、中身は見せない」が書けない。
--   そのため private の日報は行ごと消え、
--   ちゃんと書いて出した選手が「出していない人」として並んでいた。
--
--   これは提出状況という画面の目的（見落としを減らす）を裏切る。
--   出していない人を追いかけるための画面で、
--   出した人が未提出として名前を出されるのは、いちばん困る間違え方。
--
-- 直し方の考え:
--   * 選手が守りたいのは**中身**であって、出したという事実ではない。
--     「自分だけ」は「読まないでほしい」であって
--     「書いたことを隠したい」ではない（16章）。
--   * 事実だけを返す関数を作る。中身は1文字も返さない。
--   * 中身を読める日報だけ id を返す。
--     private の日報は id を返さないので、画面から開くこともできない。
--     （id を返しても RLS が止めるが、返さないほうが事故が起きない）
--   * ビューは使わない。ビューは所有者の権限で動くため、
--     何を返すかの線引きが定義の中に書かれない。
--     関数なら「何を返して、何を返さないか」がその場に残る。
--
--   選手にはこの扱いを画面で伝える。
--   「黙って伝わっている」が一番よくない。
-- =============================================================

/**
 * ある日の提出状況（12章）。
 *
 * **返すのは「出したかどうか」だけ。中身は返さない。**
 *
 * 読める日報だけ readable_report_id が入る。
 * 「自分だけ」の日報は submitted_report = true だが id は null。
 * つまりコーチは「出したことは分かるが、開けない」。
 *
 * ここを直したら daily_reports のポリシーと
 * app.can_see_report()（0022）も見ること。3つは同じ規則の上にある。
 */
create or replace function public.list_submission_status(p_team_id uuid, p_date date)
returns table (
  team_member_id uuid,
  submitted_condition boolean,
  submitted_report boolean,
  submitted_training boolean,
  readable_report_id uuid,
  report_is_private boolean,
  training_is_private boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  -- security definer は RLS を素通りする。権限は自分で確かめる。
  if not app.has_permission(p_team_id, 'report.view_all') then
    raise exception '提出状況を見る権限がありません';
  end if;

  return query
  select
    m.id,
    exists (
      select 1 from public.daily_conditions c
      where c.team_member_id = m.id and c.recorded_on = p_date and c.deleted_at is null
    ),
    exists (
      select 1 from public.daily_reports r
      where r.team_member_id = m.id and r.report_date = p_date
        and r.status = 'submitted' and r.deleted_at is null
    ),
    exists (
      select 1 from public.training_records t
      where t.team_member_id = m.id and t.performed_on = p_date and t.deleted_at is null
    ),
    -- 中身を読めるものだけ id を渡す
    (
      select r.id from public.daily_reports r
      where r.team_member_id = m.id and r.report_date = p_date
        and r.status = 'submitted' and r.deleted_at is null
        and r.visibility in ('staff', 'team')
      order by r.submitted_at desc nulls last
      limit 1
    ),
    exists (
      select 1 from public.daily_reports r
      where r.team_member_id = m.id and r.report_date = p_date
        and r.status = 'submitted' and r.deleted_at is null
        and r.visibility = 'private'
    ),
    exists (
      select 1 from public.training_records t
      where t.team_member_id = m.id and t.performed_on = p_date and t.deleted_at is null
        and t.visibility = 'private'
    )
  from public.team_members m
  where m.team_id = p_team_id
    and m.role_code = 'player'
    and m.status = 'active'
    and m.deleted_at is null;
end;
$$;

revoke all on function public.list_submission_status(uuid, date) from public;
grant execute on function public.list_submission_status(uuid, date) to authenticated;

-- 選手にこの扱いをどう伝えるかは、画面側の純粋な関数にまとめてある
-- （src/features/daily/lib/disclosure.ts）。
-- 公開範囲の選択肢のすぐ横に、そのとき何が伝わるかを出す。
