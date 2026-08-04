'use client';

import { useRef, useState, useTransition } from 'react';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/field';
import { updateAvatarAction } from '@/features/profile/actions';
import { validateAvatarFile } from '@/features/profile/schemas';
import { createClient } from '@/lib/supabase/client';
import type { ProfileRow } from '@/types/database.types';

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * プロフィール画像。
 * ファイルはブラウザから Storage へ直接送り、保存先は `avatars/<自分のID>/` に固定する。
 * 同じ制限（MIME・容量）は Storage 側のバケット設定とポリシーでも掛けている。
 */
export function AvatarUploader({ profile }: { profile: ProfileRow }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(profile.avatar_url);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleFile = (file: File) => {
    const validationError = validateAvatarFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);

    startTransition(async () => {
      const supabase = createClient();
      const extension = EXTENSIONS[file.type] ?? 'jpg';
      const path = `${profile.id}/${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { contentType: file.type, upsert: false });

      if (uploadError) {
        console.error('avatar upload failed', uploadError);
        setError('画像をアップロードできませんでした。時間をおいてお試しください。');
        return;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from('avatars').getPublicUrl(path);

      const result = await updateAvatarAction(publicUrl);
      if (result.ok) {
        setPreview(publicUrl);
      } else {
        setError(result.message);
      }
    });
  };

  const handleRemove = () => {
    setError(null);
    startTransition(async () => {
      const result = await updateAvatarAction(null);
      if (result.ok) {
        setPreview(null);
      } else {
        setError(result.message);
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <Avatar src={preview} name={profile.display_name} size={64} />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" disabled={isPending} onClick={() => inputRef.current?.click()}>
            {isPending ? '処理しています…' : '画像を選ぶ'}
          </Button>
          {preview ? (
            <Button variant="ghost" size="sm" disabled={isPending} onClick={handleRemove}>
              削除する
            </Button>
          ) : null}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        aria-label="プロフィール画像を選ぶ"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // 同じファイルを選び直せるようにする
          event.target.value = '';
          if (file) handleFile(file);
        }}
      />

      {error ? <FormMessage>{error}</FormMessage> : null}
      <p className="text-xs text-[--color-muted]">JPEG・PNG・WebP、2MBまで。</p>
    </div>
  );
}
