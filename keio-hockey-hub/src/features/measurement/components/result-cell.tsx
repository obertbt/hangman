'use client';

import { useState, useTransition } from 'react';

import { saveMeasurementResult } from '@/features/measurement/actions';

/**
 * 記録1マスぶんの入力（3章の7: 入力の負担を増やさない）。
 *
 * 記録会では30人ぶんを次々に入れる。
 * 1件ごとに「保存」を押させると手が止まるので、
 * 入力欄から離れた時点で保存する。
 *
 * 押していないのに保存されるのは不安なので、
 * 保存中と保存済みを小さく出す。
 */
export function ResultCell({
  eventId,
  itemId,
  memberId,
  defaultValue,
  unit,
  label,
}: {
  eventId: string;
  itemId: string;
  memberId: string;
  defaultValue: number | null;
  unit: string | null;
  label: string;
}) {
  const [value, setValue] = useState(defaultValue === null ? '' : String(defaultValue));
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // 最後に保存した内容。変わっていなければ送らない。
  const [lastSaved, setLastSaved] = useState(defaultValue === null ? '' : String(defaultValue));

  function handleBlur() {
    if (value.trim() === lastSaved.trim()) return;

    setError(null);
    const formData = new FormData();
    formData.set('measurement_event_id', eventId);
    formData.set('measurement_item_id', itemId);
    formData.set('team_member_id', memberId);
    formData.set('value', value);

    startTransition(async () => {
      const result = await saveMeasurementResult({}, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setLastSaved(value);
      setSaved(value.trim() === '' ? '消しました' : '保存しました');
      // しばらくしたら消す。出しっぱなしだと画面が賑やかになりすぎる。
      setTimeout(() => setSaved(null), 2000);
    });
  }

  return (
    <div>
      <div className="flex items-center gap-1">
        <input
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          aria-label={label}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onBlur={handleBlur}
          className="focus:border-keio-500 focus:ring-keio-500/30 min-h-11 w-24 rounded-lg border border-[--color-border] bg-[--color-surface] px-2 py-1 text-right text-sm outline-none focus:ring-2"
        />
        {unit ? <span className="text-xs text-[--color-muted]">{unit}</span> : null}
      </div>

      {pending ? <p className="mt-0.5 text-xs text-[--color-muted]">保存しています…</p> : null}
      {!pending && saved ? (
        <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-400">{saved}</p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-0.5 text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
