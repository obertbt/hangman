'use client';

import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/field';
import { downscaleImage } from '@/features/photos/image';
import { MAX_PHOTOS_PER_POST, validatePhotoFile } from '@/features/photos/schemas';
import type { PendingPhoto } from '@/features/photos/upload';

interface PhotoPickerProps {
  value: PendingPhoto[];
  onChange: (photos: PendingPhoto[]) => void;
  /** すでに記録に付いている枚数。合計で上限を超えないようにする。 */
  existingCount?: number;
  disabled?: boolean;
}

/**
 * 記録に添える写真を選ぶ（24章）。
 *
 * 選んだ時点では送らない。記録を保存したあとにまとめて送る。
 * 書きかけでやめたときに、行き場のない画像が残らないようにするため。
 */
export function PhotoPicker({ value, onChange, existingCount = 0, disabled = false }: PhotoPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // 画面から消えるときにプレビュー用の URL を解放する。
  // 解放するのは「最後に表示していたぶん」なので、値の追跡と後片付けは分ける。
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);
  useEffect(() => {
    return () => {
      for (const photo of latest.current) URL.revokeObjectURL(photo.previewUrl);
    };
  }, []);

  const remaining = MAX_PHOTOS_PER_POST - existingCount - value.length;

  const handleFiles = async (files: File[]) => {
    setError(null);

    if (files.length > remaining) {
      setError(`写真は1件につき${MAX_PHOTOS_PER_POST}枚までです。`);
    }

    const accepted = files.slice(0, Math.max(0, remaining));
    if (accepted.length === 0) return;

    setIsProcessing(true);
    try {
      const added: PendingPhoto[] = [];
      for (const file of accepted) {
        const invalid = validatePhotoFile(file);
        if (invalid) {
          setError(invalid);
          continue;
        }
        const blob = await downscaleImage(file);
        added.push({ key: crypto.randomUUID(), blob, previewUrl: URL.createObjectURL(blob) });
      }
      if (added.length > 0) onChange([...value, ...added]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemove = (key: string) => {
    const target = value.find((photo) => photo.key === key);
    if (target) URL.revokeObjectURL(target.previewUrl);
    onChange(value.filter((photo) => photo.key !== key));
    setError(null);
  };

  return (
    <fieldset>
      <legend className="pb-2 text-sm font-medium">写真（任意）</legend>

      {value.length > 0 ? (
        <ul className="grid grid-cols-4 gap-2 pb-2">
          {value.map((photo) => (
            <li key={photo.key} className="relative">
              {/* 選んだばかりの画像なので next/image ではなく素の img を使う */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.previewUrl} alt="" className="aspect-square w-full rounded-xl object-cover" />
              <button
                type="button"
                disabled={disabled}
                onClick={() => handleRemove(photo.key)}
                className="absolute -top-1.5 -right-1.5 flex size-6 items-center justify-center rounded-full border border-[--color-border] bg-[--color-surface] text-xs"
              >
                <span aria-hidden>×</span>
                <span className="sr-only">この写真をやめる</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={disabled || isProcessing || remaining <= 0}
        onClick={() => inputRef.current?.click()}
      >
        {isProcessing ? '読み込んでいます…' : '写真を選ぶ'}
      </Button>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="sr-only"
        aria-label="写真を選ぶ"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          // 同じファイルを選び直せるようにする
          event.target.value = '';
          if (files.length > 0) void handleFiles(files);
        }}
      />

      {error ? <FormMessage>{error}</FormMessage> : null}
      <p className="mt-2 text-xs text-[--color-muted]">
        {MAX_PHOTOS_PER_POST}枚まで。公開範囲は記録と同じです。
      </p>
    </fieldset>
  );
}
