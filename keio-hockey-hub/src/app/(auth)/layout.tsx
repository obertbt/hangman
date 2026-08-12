import { env } from '@/lib/env';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <h1 className="mb-1 text-center text-xl font-bold">{env.NEXT_PUBLIC_APP_NAME}</h1>
      <p className="mb-8 text-center text-sm text-[--color-muted]">慶應義塾大学 女子フィールドホッケー部</p>
      <div className="rounded-xl border border-[--color-border] bg-[--color-surface] p-5">{children}</div>
    </main>
  );
}
