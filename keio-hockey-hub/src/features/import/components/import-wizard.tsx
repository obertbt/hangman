'use client';

import { useActionState, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field, FormMessage, Select, TextArea } from '@/components/ui/field';
import {
  analyzePlayerImport,
  executePlayerImport,
  type ExecuteState,
  type PreviewState,
} from '@/features/import/actions';
import { PLAYER_FIELDS, type MappingSuggestion, type PlayerField } from '@/features/import/lib/mapping';
import type { UpsertMode } from '@/features/import/lib/player-import';

/**
 * データ移行の画面（34章・39章）。
 *
 *   対象データ選択 → 貼り付け/CSV → 解析 → 列マッピング
 *   → プレビュー → 警告・エラー確認 → インポート → 結果表示
 *
 * 目標は「Google Sheets を全選択してコピー、貼り付け、確認、移行」だけで済むこと（49章）。
 */

const UPSERT_LABELS: Record<UpsertMode, string> = {
  insert_only: '新規追加のみ（既存はそのまま）',
  update_existing: '既存を更新する',
  skip_existing: '既存を飛ばす',
};

const SAMPLE = ['氏名\t学年\tポジション\t背番号', '山田花子\t3\tMF\t10', '鈴木花\t2\tFW\t9'].join('\n');

function AnalyzeButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} block>
      {pending ? '解析しています…' : '内容を確認する'}
    </Button>
  );
}

function ExecuteButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="action" disabled={pending || count === 0} block size="lg">
      {pending ? '取り込んでいます…' : `${count} 件を取り込む`}
    </Button>
  );
}

export function ImportWizard() {
  const [rawText, setRawText] = useState('');
  const [upsertMode, setUpsertMode] = useState<UpsertMode>('insert_only');
  const [mappingOverride, setMappingOverride] = useState<MappingSuggestion[] | null>(null);
  const [sourceType, setSourceType] = useState<'paste' | 'csv'>('paste');
  const [fileName, setFileName] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [previewState, analyzeAction] = useActionState<PreviewState, FormData>(analyzePlayerImport, {});
  const [executeState, executeAction] = useActionState<ExecuteState, FormData>(executePlayerImport, {});

  const preview = previewState.preview;
  // 利用者が直したマッピングがあればそれを使う
  const mappings = mappingOverride ?? preview?.mappings ?? [];

  const importableCount = preview ? preview.summary.insert + preview.summary.update : 0;

  async function handleFile(file: File) {
    const text = await file.text();
    setRawText(text);
    setFileName(file.name);
    setSourceType('csv');
    setMappingOverride(null);
  }

  function updateMapping(sourceIndex: number, targetField: PlayerField | null) {
    const next = mappings.map((mapping) =>
      mapping.sourceIndex === sourceIndex
        ? { ...mapping, targetField, isAutoDetected: false, confidence: 0 }
        : // 同じ項目が二重に割り当たらないよう、他の列からは外す
          mapping.targetField === targetField && targetField !== null
          ? { ...mapping, targetField: null, isAutoDetected: false, confidence: 0 }
          : mapping,
    );
    setMappingOverride(next);
  }

  if (executeState.result) {
    const { inserted, updated, skipped } = executeState.result;
    return (
      <Card>
        <CardHeader title="取り込みが完了しました" />
        <ul className="space-y-1 text-sm">
          <li>新規登録: {inserted} 件</li>
          <li>更新: {updated} 件</li>
          <li>対象外: {skipped} 件</li>
        </ul>
        <p className="mt-3 text-xs text-[--color-muted]">
          取り消したい場合は、下の「取り込み履歴」から元に戻せます。
        </p>
        <div className="mt-4 flex gap-2">
          <Button
            onClick={() => {
              setRawText('');
              setMappingOverride(null);
              window.location.reload();
            }}
          >
            続けて別のデータを取り込む
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* --- 入力 --- */}
      <Card>
        <CardHeader
          title="1. データを貼り付ける"
          description="Google スプレッドシートで範囲を選んでコピーし、そのまま貼り付けてください。1行目は見出しにします。"
        />

        <form action={analyzeAction} className="space-y-3">
          <input type="hidden" name="upsertMode" value={upsertMode} />
          {mappingOverride ? (
            <input type="hidden" name="mappingJson" value={JSON.stringify(mappingOverride)} />
          ) : null}

          <Field label="貼り付け欄" htmlFor="rawText" required>
            <TextArea
              id="rawText"
              name="rawText"
              value={rawText}
              onChange={(event) => {
                setRawText(event.target.value);
                setSourceType('paste');
                setMappingOverride(null);
              }}
              rows={8}
              className="font-mono text-xs"
              placeholder={SAMPLE}
            />
          </Field>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              CSVファイルを選ぶ
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setRawText(SAMPLE)}>
              例を入れる
            </Button>
            {fileName ? <span className="text-xs text-[--color-muted]">{fileName}</span> : null}
          </div>

          <Field label="既存の選手と重なった時" htmlFor="upsertMode">
            <Select
              id="upsertMode"
              value={upsertMode}
              onChange={(event) => setUpsertMode(event.target.value as UpsertMode)}
            >
              {Object.entries(UPSERT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>

          {previewState.error ? <FormMessage tone="error">{previewState.error}</FormMessage> : null}

          <AnalyzeButton />
        </form>
      </Card>

      {/* --- 列マッピング --- */}
      {preview ? (
        <Card>
          <CardHeader
            title="2. 列の対応づけ"
            description="自動で推測しています。違っていれば直してください。"
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[--color-muted]">
                  <th className="pb-2">元の列</th>
                  <th className="pb-2">取り込み先</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((mapping) => (
                  <tr key={mapping.sourceIndex} className="border-t border-[--color-border]">
                    <td className="py-2 pr-3">
                      <span className="font-medium">{mapping.sourceColumn || '（見出しなし）'}</span>
                      {mapping.targetField && mapping.confidence < 1 && mapping.isAutoDetected ? (
                        <Badge tone="warning" className="ml-2">
                          推測
                        </Badge>
                      ) : null}
                    </td>
                    <td className="py-2">
                      <Select
                        aria-label={`${mapping.sourceColumn} の取り込み先`}
                        value={mapping.targetField ?? ''}
                        onChange={(event) =>
                          updateMapping(
                            mapping.sourceIndex,
                            event.target.value === '' ? null : (event.target.value as PlayerField),
                          )
                        }
                      >
                        <option value="">取り込まない</option>
                        {PLAYER_FIELDS.map((definition) => (
                          <option key={definition.field} value={definition.field}>
                            {definition.label}
                            {definition.required ? '（必須）' : ''}
                          </option>
                        ))}
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {mappingOverride ? (
            <form action={analyzeAction} className="mt-3">
              <input type="hidden" name="rawText" value={rawText} />
              <input type="hidden" name="upsertMode" value={upsertMode} />
              <input type="hidden" name="mappingJson" value={JSON.stringify(mappingOverride)} />
              <Button type="submit" variant="secondary" size="sm">
                この対応づけで再確認する
              </Button>
            </form>
          ) : null}
        </Card>
      ) : null}

      {/* --- プレビュー --- */}
      {preview ? (
        <Card>
          <CardHeader title="3. 取り込む前の確認" />

          {preview.warnings.map((warning) => (
            <p key={warning} className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {warning}
            </p>
          ))}

          <dl className="mb-4 grid grid-cols-3 gap-2 text-center text-sm sm:grid-cols-6">
            <SummaryCell label="総件数" value={preview.summary.total} />
            <SummaryCell label="正常" value={preview.summary.valid} />
            <SummaryCell label="警告" value={preview.summary.warning} tone="warning" />
            <SummaryCell label="エラー" value={preview.summary.error} tone="danger" />
            <SummaryCell label="新規" value={preview.summary.insert} tone="success" />
            <SummaryCell label="更新" value={preview.summary.update} tone="info" />
          </dl>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[--color-muted]">
                  <th className="pb-2">行</th>
                  <th className="pb-2">状態</th>
                  <th className="pb-2">氏名</th>
                  <th className="pb-2">学年</th>
                  <th className="pb-2">ポジ</th>
                  <th className="pb-2">背番号</th>
                  <th className="pb-2">内容</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.rowNumber} className="border-t border-[--color-border] align-top">
                    <td className="py-2 pr-2 text-xs text-[--color-muted]">{row.rowNumber}</td>
                    <td className="py-2 pr-2">
                      <RowStatusBadge status={row.status} action={row.action} />
                    </td>
                    <td className="py-2 pr-2">{row.normalized?.full_name ?? '—'}</td>
                    <td className="py-2 pr-2">{row.normalized?.grade ?? '—'}</td>
                    <td className="py-2 pr-2">{row.normalized?.position ?? '—'}</td>
                    <td className="py-2 pr-2">{row.normalized?.jersey_number ?? '—'}</td>
                    <td className="py-2 text-xs text-[--color-muted]">
                      {row.messages.map((message, index) => (
                        <p key={index} className={message.level === 'error' ? 'text-red-600' : undefined}>
                          {message.message}
                        </p>
                      ))}
                      {row.candidates.length > 0 ? (
                        <ul className="mt-1 list-inside list-disc">
                          {row.candidates.map((candidate) => (
                            <li key={candidate.id}>{candidate.label}</li>
                          ))}
                        </ul>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {/* --- 実行 --- */}
      {preview ? (
        <Card>
          <CardHeader
            title="4. 取り込む"
            description={
              preview.summary.error > 0
                ? `エラーの ${preview.summary.error} 行は取り込みません。残りだけを登録します。`
                : undefined
            }
          />
          <form action={executeAction} className="space-y-3">
            <input type="hidden" name="rawText" value={rawText} />
            <input type="hidden" name="upsertMode" value={upsertMode} />
            <input type="hidden" name="sourceType" value={sourceType} />
            <input type="hidden" name="fileName" value={fileName} />
            {mappingOverride ? (
              <input type="hidden" name="mappingJson" value={JSON.stringify(mappingOverride)} />
            ) : null}

            {executeState.error ? <FormMessage tone="error">{executeState.error}</FormMessage> : null}

            <ExecuteButton count={importableCount} />
          </form>
        </Card>
      ) : null}
    </div>
  );
}

function SummaryCell({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'warning' | 'danger' | 'success' | 'info';
}) {
  const color =
    tone === 'danger' && value > 0
      ? 'text-red-600'
      : tone === 'warning' && value > 0
        ? 'text-amber-600'
        : tone === 'success' && value > 0
          ? 'text-emerald-600'
          : undefined;

  return (
    <div className="rounded-lg border border-[--color-border] px-2 py-2">
      <dt className="text-[11px] text-[--color-muted]">{label}</dt>
      <dd className={`text-lg font-semibold ${color ?? ''}`}>{value}</dd>
    </div>
  );
}

function RowStatusBadge({ status, action }: { status: string; action: string }) {
  if (status === 'error') return <Badge tone="danger">エラー</Badge>;
  if (action === 'skip') return <Badge tone="neutral">対象外</Badge>;
  if (action === 'update') return <Badge tone="info">更新</Badge>;
  if (status === 'warning') return <Badge tone="warning">警告</Badge>;
  return <Badge tone="success">新規</Badge>;
}
