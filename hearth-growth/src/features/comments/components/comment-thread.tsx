'use client';

import { useState, useTransition } from 'react';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/field';
import {
  createCommentAction,
  deleteCommentAction,
  getCommentsAction,
  setCommentHiddenAction,
} from '@/features/comments/actions';
import type { CommentView } from '@/features/comments/schemas';
import { formatRelativeTime } from '@/lib/date/relative';
import { cn } from '@/lib/utils/cn';

interface CommentThreadProps {
  postId: string;
  commentCount: number;
  timeZone: string;
}

/**
 * コメント（10.2）。
 *
 * 最初から全件は取らない。開いたときに取りに行く（21章）。
 * 何が見えるかは RLS が決めるため、元投稿の公開範囲を超えない。
 */
export function CommentThread({ postId, commentCount, timeZone }: CommentThreadProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [comments, setComments] = useState<CommentView[] | null>(null);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = () => {
    startTransition(async () => {
      setComments(await getCommentsAction(postId));
    });
  };

  const toggle = () => {
    const next = !isOpen;
    setIsOpen(next);
    if (next && comments === null) load();
  };

  const submit = () => {
    if (body.trim().length === 0) return;
    setError(null);
    startTransition(async () => {
      const result = await createCommentAction({ postId, body });
      if (result.ok) {
        setBody('');
        setComments(await getCommentsAction(postId));
      } else {
        setError(result.message);
      }
    });
  };

  const remove = (commentId: string) => {
    if (!window.confirm('このコメントを削除しますか？')) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteCommentAction(commentId);
      if (result.ok) {
        setComments(await getCommentsAction(postId));
      } else {
        setError(result.message);
      }
    });
  };

  const toggleHidden = (commentId: string, hidden: boolean) => {
    setError(null);
    startTransition(async () => {
      const result = await setCommentHiddenAction(commentId, hidden);
      if (result.ok) {
        setComments(await getCommentsAction(postId));
      } else {
        setError(result.message);
      }
    });
  };

  const shownCount = comments?.length ?? commentCount;

  return (
    <div className="space-y-3">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={toggle}
        className="text-xs text-[--color-muted] underline underline-offset-4"
      >
        {shownCount > 0 ? `コメント ${shownCount}件` : 'コメントする'}
      </button>

      {isOpen ? (
        <div className="space-y-3">
          {comments === null ? (
            <p className="text-xs text-[--color-muted]">読み込んでいます…</p>
          ) : (
            <ul className="space-y-3">
              {comments.map((comment) => (
                <li key={comment.id} className="flex gap-2">
                  <Avatar src={comment.avatarUrl} name={comment.displayName} size={28} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-[--color-muted]">
                      {comment.displayName}・{formatRelativeTime(comment.createdAt, { timeZone })}
                      {comment.isHidden ? '・非表示' : ''}
                    </p>
                    <p className={cn('text-sm whitespace-pre-wrap', comment.isHidden && 'opacity-50')}>
                      {comment.body}
                    </p>

                    <div className="mt-1 flex gap-3 text-xs text-[--color-muted]">
                      {comment.canModerate ? (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => toggleHidden(comment.id, !comment.isHidden)}
                          className="underline underline-offset-4"
                        >
                          {comment.isHidden ? '表示に戻す' : '非表示にする'}
                        </button>
                      ) : null}
                      {comment.isMine || comment.canModerate ? (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => remove(comment.id)}
                          className="underline underline-offset-4"
                        >
                          削除
                        </button>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-2">
            <Textarea
              rows={2}
              value={body}
              maxLength={2000}
              placeholder="ひとこと送る"
              aria-label="コメント"
              onChange={(event) => setBody(event.target.value)}
            />
            <Button size="sm" disabled={isPending || body.trim().length === 0} onClick={submit}>
              {isPending ? '送っています…' : '送る'}
            </Button>
          </div>

          {error ? (
            <p role="alert" className="text-xs text-red-600">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
