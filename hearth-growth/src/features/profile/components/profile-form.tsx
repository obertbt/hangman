'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Field, FormMessage, Input, Select, Textarea } from '@/components/ui/field';
import { updateProfileAction } from '@/features/profile/actions';
import { updateProfileSchema, type UpdateProfileInput } from '@/features/profile/schemas';
import { VISIBILITY_OPTIONS } from '@/lib/permissions/visibility';
import type { ProfileRow } from '@/types/database.types';

/** 選びやすさを優先し、よく使うタイムゾーンだけを並べる。 */
const TIMEZONES = [
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Australia/Sydney',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
];

export function ProfileForm({ profile }: { profile: ProfileRow }) {
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      displayName: profile.display_name,
      bio: profile.bio ?? '',
      timezone: profile.timezone,
      defaultVisibility: profile.default_visibility,
    },
  });

  // 一覧に無いタイムゾーンを使っている場合も選択肢に残す
  const timezoneOptions = TIMEZONES.includes(profile.timezone)
    ? TIMEZONES
    : [profile.timezone, ...TIMEZONES];

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateProfileAction(values);
      if (result.ok) {
        setSaved(true);
      } else {
        setFormError(result.message);
      }
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {formError ? <FormMessage>{formError}</FormMessage> : null}
      {saved ? <FormMessage tone="success">保存しました。</FormMessage> : null}

      <Field label="表示名" htmlFor="displayName" error={errors.displayName?.message}>
        <Input id="displayName" aria-invalid={Boolean(errors.displayName)} {...register('displayName')} />
      </Field>

      <Field label="自己紹介" htmlFor="bio" error={errors.bio?.message}>
        <Textarea id="bio" rows={3} aria-invalid={Boolean(errors.bio)} {...register('bio')} />
      </Field>

      <Field
        label="タイムゾーン"
        htmlFor="timezone"
        error={errors.timezone?.message}
        hint="「今日」「今週」の集計はこの時間帯で計算します。"
      >
        <Select id="timezone" {...register('timezone')}>
          {timezoneOptions.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="記録の既定の公開範囲"
        htmlFor="defaultVisibility"
        error={errors.defaultVisibility?.message}
        hint="投稿ごとに変更できます。"
      >
        <Select id="defaultVisibility" {...register('defaultVisibility')}>
          {VISIBILITY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>

      <Button type="submit" disabled={isPending}>
        {isPending ? '保存しています…' : '保存する'}
      </Button>
    </form>
  );
}
