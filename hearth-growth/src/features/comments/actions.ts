'use server';

import { revalidatePath } from 'next/cache';
import { GENERIC_ERROR_MESSAGE } from '@/features/auth/errors';
import { createCommentSchema, type CommentView, type CreateCommentInput } from '@/features/comments/schemas';
import { fail, ok, type ActionResult } from '@/lib/actions/result';
import { createClient } from '@/lib/supabase/server';
import { uuidSchema } from '@/lib/validations/common';

/**
 * コメントの取得。
 *
 * タイムラインでは最初から全件取らず、開いたときにここで取る（21章）。
 * 何が見えるかは RLS が決める（元投稿の公開範囲を超えない）。
 */
export async function getCommentsAction(postId: string): Promise<CommentView[]> {
  const parsed = uuidSchema.safeParse(postId);
  if (!parsed.success) return [];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const [{ data: comments }, { data: post }] = await Promise.all([
    supabase
      .from('comments')
      .select('id, user_id, body, is_hidden, created_at, profile:profiles(display_name, avatar_url)')
      .eq('post_id', parsed.data)
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
    supabase.from('activity_posts').select('user_id').eq('id', parsed.data).maybeSingle(),
  ]);

  const isPostOwner = post?.user_id === user.id;

  return (comments ?? []).map((comment) => ({
    id: comment.id,
    userId: comment.user_id,
    displayName: comment.profile?.display_name ?? 'メンバー',
    avatarUrl: comment.profile?.avatar_url ?? null,
    body: comment.body,
    createdAt: comment.created_at,
    isHidden: comment.is_hidden,
    isMine: comment.user_id === user.id,
    canModerate: isPostOwner,
  }));
}

export async function createCommentAction(input: CreateCommentInput): Promise<ActionResult> {
  const parsed = createCommentSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail('ログインの有効期限が切れました。もう一度ログインしてください。');

  const { error } = await supabase.from('comments').insert({
    post_id: parsed.data.postId,
    user_id: user.id,
    body: parsed.data.body,
  });

  if (error) {
    console.error('createCommentAction failed', error);
    // 閲覧できない投稿へのコメントは RLS が拒否する
    if (error.code === '42501' || error.code === 'PGRST301') {
      return fail('この投稿にはコメントできません。');
    }
    return fail(GENERIC_ERROR_MESSAGE);
  }

  revalidatePath('/timeline');
  revalidatePath('/home');
  return ok();
}

/** 論理削除。書いた本人と、投稿者が消せる。 */
export async function deleteCommentAction(commentId: string): Promise<ActionResult> {
  const parsed = uuidSchema.safeParse(commentId);
  if (!parsed.success) return fail(GENERIC_ERROR_MESSAGE);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail('ログインの有効期限が切れました。もう一度ログインしてください。');

  // 本人以外（投稿者）は update できないため、行の削除で対応する。
  // RLS の delete ポリシーが「本人 or 投稿者」を保証している。
  const { data: comment } = await supabase
    .from('comments')
    .select('user_id')
    .eq('id', parsed.data)
    .maybeSingle();

  const { error } =
    comment?.user_id === user.id
      ? await supabase.from('comments').update({ deleted_at: new Date().toISOString() }).eq('id', parsed.data)
      : await supabase.from('comments').delete().eq('id', parsed.data);

  if (error) {
    console.error('deleteCommentAction failed', error);
    return fail(GENERIC_ERROR_MESSAGE);
  }

  revalidatePath('/timeline');
  revalidatePath('/home');
  return ok();
}

/**
 * 投稿者がコメントを非表示にする（10.2）。
 * 本文の書き換えはできない（RPC が非表示フラグだけを扱う）。
 */
export async function setCommentHiddenAction(commentId: string, hidden: boolean): Promise<ActionResult> {
  const parsed = uuidSchema.safeParse(commentId);
  if (!parsed.success) return fail(GENERIC_ERROR_MESSAGE);

  const supabase = await createClient();
  const { error } = await supabase.rpc('set_comment_hidden', {
    p_comment_id: parsed.data,
    p_hidden: hidden,
  });

  if (error) {
    console.error('setCommentHiddenAction failed', error);
    if (error.code === '42501') return fail('この操作を行う権限がありません。');
    return fail(GENERIC_ERROR_MESSAGE);
  }

  revalidatePath('/timeline');
  revalidatePath('/home');
  return ok();
}
