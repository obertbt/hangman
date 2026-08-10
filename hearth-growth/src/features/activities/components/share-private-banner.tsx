'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/field';
import { sharePrivateActivitiesAction } from '@/features/activities/actions';

interface SharePrivateBannerProps {
  privateCount: number;
  groups: { id: string; name: string }[];
}

/**
 * 「自分だけ」のままの記録があることを伝える。
 *
 * グループを作る前に記録すると、公開範囲は「自分だけ」になる。
 * あとから参加しても自動では共有しない（勝手に広げてはいけない）ので、
 * 気づかないまま「仲間から見えない」となりやすい。ここで気づけるようにする。
 *
 * 押すまで何も起きない。公開範囲を広げる操作なので、
 * 件数と公開先を見せたうえで、もう一度確認してから動かす。
 */
export function SharePrivateBanner({ privateCount, groups }: SharePrivateBannerProps) {
  const router = useRouter();
  const [groupId, setGroupId] = useState(groups[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [sharedCount, setSharedCount] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  if (privateCount === 0 || groups.length === 0) return null;

  if (sharedCount !== null) {
    return (
      <FormMessage tone="success">
        {sharedCount}件の記録をグループに公開しました。仲間のタイムラインに並びます。
      </FormMessage>
    );
  }

  const groupName = groups.find((group) => group.id === groupId)?.name ?? '';

  const handleShare = () => {
    const confirmed = window.confirm(
      `「自分だけ」の記録 ${privateCount}件を「${groupName}」のメンバーに見せます。\nよろしいですか？`,
    );
    if (!confirmed) return;

    setError(null);
    startTransition(async () => {
      const result = await sharePrivateActivitiesAction({ groupId, expectedCount: privateCount });
      if (result.ok) {
        setSharedCount(result.data);
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  };

  return (
    <div className="border-ember-400 bg-ember-400/10 space-y-3 rounded-2xl border p-4">
      <div>
        <p className="text-sm font-medium">{privateCount}件の記録が「自分だけ」のままです</p>
        <p className="mt-1 text-sm text-[--color-muted]">
          グループに入る前に記録したものは、仲間からは見えません。まとめて公開できます。
        </p>
      </div>

      {error ? <FormMessage>{error}</FormMessage> : null}

      {groups.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {groups.map((group) => (
            <button
              key={group.id}
              type="button"
              aria-pressed={groupId === group.id}
              onClick={() => setGroupId(group.id)}
              className={
                groupId === group.id
                  ? 'border-ember-500 bg-ember-500/10 min-h-9 rounded-full border px-3 text-xs font-medium'
                  : 'min-h-9 rounded-full border border-[--color-border] px-3 text-xs'
              }
            >
              {group.name}
            </button>
          ))}
        </div>
      ) : null}

      <Button size="sm" disabled={isPending} onClick={handleShare}>
        {isPending ? '公開しています…' : `${groups.length > 1 ? '選んだ' : ''}グループに公開する`}
      </Button>
      <p className="text-xs text-[--color-muted]">
        個別に変えたいときは、記録を開いて公開範囲を選び直してください。
      </p>
    </div>
  );
}
