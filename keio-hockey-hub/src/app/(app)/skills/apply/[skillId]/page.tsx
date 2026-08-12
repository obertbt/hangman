import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { Card, CardHeader } from '@/components/ui/card';
import { ApplyForm } from '@/features/skills/components/apply-form';
import { getEvidenceCandidates } from '@/features/skills/queries';
import { requireSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'スキルを申請する' };

/**
 * スキル申請の入口（32章）。
 *
 * 根拠の候補は「自分のもの」だけを出す。
 * 他人の動画や質問を根拠にはできない（0014 のトリガでも守っている）。
 */
export default async function SkillApplyPage({ params }: { params: Promise<{ skillId: string }> }) {
  const session = await requireSession();
  const { skillId } = await params;

  const supabase = await createClient();

  const { data: skill } = await supabase
    .from('skills')
    .select('*')
    .eq('team_id', session.teamId)
    .eq('id', skillId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!skill) notFound();

  // すでに承認済みなら、申請させる意味がない
  const { data: current } = await supabase
    .from('player_skills')
    .select('status')
    .eq('team_member_id', session.teamMemberId)
    .eq('skill_id', skillId)
    .is('deleted_at', null)
    .maybeSingle();

  if (current?.status === 'approved') {
    redirect('/skills');
  }

  const evidence = await getEvidenceCandidates(session);

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <Link href="/skills" className="text-keio-700 dark:text-keio-300 underline">
          ← スキル一覧へ戻る
        </Link>
      </p>

      <header>
        <h1 className="text-xl font-bold">スキルを申請する</h1>
        <p className="mt-1 text-sm text-[--color-muted]">
          できるようになったことを、根拠と一緒にコーチへ送ります。
        </p>
      </header>

      <Card>
        <CardHeader title="申請の内容" />
        <ApplyForm
          skillId={skill.id}
          skillName={skill.name}
          criteria={skill.criteria}
          videos={evidence.videos.map((video) => ({ id: video.id, label: video.title }))}
          clips={evidence.clips.map((clip) => ({
            id: clip.id,
            label: clip.title ?? '指定した場面',
            sub: clip.videoTitle,
            startSeconds: clip.start_seconds,
            endSeconds: clip.end_seconds,
          }))}
          feedbacks={evidence.feedbacks.map((request) => ({
            id: request.id,
            label: request.question.slice(0, 60),
          }))}
        />
      </Card>
    </div>
  );
}
