import type { Metadata } from 'next';

import { SignupForm } from '@/features/auth/components/signup-form';

export const metadata: Metadata = { title: '新規登録' };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <SignupForm next={next} />;
}
