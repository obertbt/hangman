import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

import { cn } from '@/lib/utils/cn';

const controlClass =
  'min-h-11 w-full rounded-xl border border-[--color-border] bg-[--color-surface] px-3 py-2 text-base outline-none placeholder:text-[--color-muted]/70 focus-visible:border-ember-500';

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}

/** ラベル・入力・エラーの組。エラーは role="alert" で読み上げにも届くようにする。 */
export function Field({ label, htmlFor, error, hint, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error ? <p className="text-xs text-[--color-muted]">{hint}</p> : null}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(controlClass, 'min-h-24 resize-y', className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(controlClass, className)} {...props} />;
}

/** フォーム全体に関わるエラー（認証失敗など）。 */
export function FormMessage({
  tone = 'error',
  children,
}: {
  tone?: 'error' | 'success';
  children: ReactNode;
}) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'rounded-xl px-3 py-2 text-sm',
        tone === 'error' ? 'bg-red-50 text-red-700' : 'bg-hearth-100 text-hearth-800',
      )}
    >
      {children}
    </p>
  );
}
