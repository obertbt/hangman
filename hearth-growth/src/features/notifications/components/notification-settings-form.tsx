'use client';

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/field';
import { updateNotificationSettingsAction } from '@/features/notifications/actions';
import {
  NOTIFICATION_SETTING_LABELS,
  type NotificationSettingsInput,
} from '@/features/notifications/schemas';
import type { ProfileRow } from '@/types/database.types';

/** お知らせの受け取り方。3つとも切れる。 */
export function NotificationSettingsForm({ profile }: { profile: ProfileRow }) {
  const [settings, setSettings] = useState<NotificationSettingsInput>({
    notifyReaction: profile.notify_reaction,
    notifyComment: profile.notify_comment,
    notifyGroupJoin: profile.notify_group_join,
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSave = () => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateNotificationSettingsAction(settings);
      if (result.ok) {
        setSaved(true);
      } else {
        setError(result.message);
      }
    });
  };

  return (
    <div className="space-y-4">
      {error ? <FormMessage>{error}</FormMessage> : null}
      {saved ? <FormMessage tone="success">保存しました。</FormMessage> : null}

      <ul className="space-y-3">
        {NOTIFICATION_SETTING_LABELS.map(({ key, label, hint }) => (
          <li key={key}>
            <label className="flex min-h-11 items-start gap-3">
              <input
                type="checkbox"
                className="accent-ember-700 mt-0.5 size-5 shrink-0"
                checked={settings[key]}
                onChange={(event) => setSettings({ ...settings, [key]: event.target.checked })}
              />
              <span>
                <span className="block text-sm">{label}</span>
                {hint ? <span className="block text-xs text-[--color-muted]">{hint}</span> : null}
              </span>
            </label>
          </li>
        ))}
      </ul>

      <Button disabled={isPending} onClick={handleSave}>
        {isPending ? '保存しています…' : '保存する'}
      </Button>

      <p className="text-xs text-[--color-muted]">
        お知らせはアプリの中だけに出ます。スマートフォンの通知欄には出しません。
      </p>
    </div>
  );
}
