import { toHalfWidth } from './normalize';

/**
 * 列マッピング（40章）。
 *
 * スプレッドシートの列名に完全一致を求めない。
 * 自動で推測しつつ、結果は必ず利用者が直せるようにする（UI 側で担保）。
 */

/** 取り込み先の項目。 */
export type PlayerField =
  | 'full_name'
  | 'furigana'
  | 'email'
  | 'grade'
  | 'admission_year'
  | 'position'
  | 'sub_position'
  | 'jersey_number'
  | 'personal_goal'
  | 'external_id';

export interface FieldDefinition {
  field: PlayerField;
  label: string;
  /** 必須項目か。 */
  required: boolean;
  /** 見出しの候補。小文字・記号除去して比較する。 */
  aliases: string[];
}

export const PLAYER_FIELDS: FieldDefinition[] = [
  {
    field: 'full_name',
    label: '氏名',
    required: true,
    aliases: ['氏名', '名前', '選手名', 'なまえ', 'name', 'player', 'playername', 'fullname', '選手'],
  },
  {
    field: 'furigana',
    label: 'ふりがな',
    required: false,
    aliases: ['ふりがな', 'フリガナ', 'よみ', '読み', 'かな', 'カナ', 'furigana', 'kana', 'yomi'],
  },
  {
    field: 'email',
    label: 'メールアドレス',
    required: false,
    aliases: ['メールアドレス', 'メール', 'mail', 'email', 'mailaddress', 'emailaddress', 'アドレス'],
  },
  {
    field: 'grade',
    label: '学年',
    required: false,
    aliases: ['学年', '年次', '回生', 'grade', 'year', 'schoolyear'],
  },
  {
    field: 'admission_year',
    label: '入学年度',
    required: false,
    aliases: ['入学年度', '入学年', '入部年度', '入部年', 'admissionyear', 'entryyear', 'joinyear'],
  },
  {
    field: 'position',
    label: 'ポジション',
    required: false,
    aliases: ['ポジション', 'ポジ', 'position', 'pos', '守備位置'],
  },
  {
    field: 'sub_position',
    label: 'サブポジション',
    required: false,
    aliases: ['サブポジション', 'サブポジ', 'subposition', 'subpos', '副ポジション'],
  },
  {
    field: 'jersey_number',
    label: '背番号',
    required: false,
    aliases: ['背番号', '番号', 'number', 'no', 'jersey', 'jerseynumber', 'uniformnumber', '#'],
  },
  {
    field: 'personal_goal',
    label: '個人目標',
    required: false,
    aliases: ['個人目標', '目標', 'goal', 'personalgoal', 'target'],
  },
  {
    field: 'external_id',
    label: '旧システムID',
    required: false,
    aliases: ['id', '旧id', 'externalid', '選手id', 'playerid', '管理番号'],
  },
];

/** 比較用に見出しを均す。全角・空白・記号・大文字小文字の違いを消す。 */
export function canonicalizeHeader(header: string): string {
  return toHalfWidth(header)
    .toLowerCase()
    .replace(/[\s_\-()（）[\]・.]/g, '')
    .trim();
}

export interface MappingSuggestion {
  sourceIndex: number;
  sourceColumn: string;
  targetField: PlayerField | null;
  confidence: number;
  isAutoDetected: boolean;
}

/**
 * 見出しから取り込み先を推測する。
 *
 * confidence:
 *   1.0  別名表に完全一致
 *   0.6  別名を含んでいる（「選手氏名」など）
 *   0    分からない
 */
export function suggestMapping(headers: string[]): MappingSuggestion[] {
  const used = new Set<PlayerField>();

  // まず完全一致だけを先に確定させる。部分一致で先に取られるのを防ぐ。
  const exact = new Map<number, { field: PlayerField; confidence: number }>();

  headers.forEach((header, index) => {
    const canonical = canonicalizeHeader(header);
    if (canonical === '') return;

    for (const definition of PLAYER_FIELDS) {
      if (used.has(definition.field)) continue;
      if (definition.aliases.some((alias) => canonicalizeHeader(alias) === canonical)) {
        exact.set(index, { field: definition.field, confidence: 1 });
        used.add(definition.field);
        return;
      }
    }
  });

  return headers.map((header, index) => {
    const hit = exact.get(index);
    if (hit) {
      return {
        sourceIndex: index,
        sourceColumn: header,
        targetField: hit.field,
        confidence: hit.confidence,
        isAutoDetected: true,
      };
    }

    const canonical = canonicalizeHeader(header);
    if (canonical !== '') {
      for (const definition of PLAYER_FIELDS) {
        if (used.has(definition.field)) continue;
        const partial = definition.aliases.some(
          (alias) => canonical.includes(canonicalizeHeader(alias)) && canonicalizeHeader(alias).length >= 2,
        );
        if (partial) {
          used.add(definition.field);
          return {
            sourceIndex: index,
            sourceColumn: header,
            targetField: definition.field,
            confidence: 0.6,
            isAutoDetected: true,
          };
        }
      }
    }

    return {
      sourceIndex: index,
      sourceColumn: header,
      targetField: null,
      confidence: 0,
      isAutoDetected: true,
    };
  });
}

/** 必須項目が割り当てられているか。足りなければ先へ進ませない。 */
export function missingRequiredFields(mappings: MappingSuggestion[]): FieldDefinition[] {
  const assigned = new Set(mappings.map((mapping) => mapping.targetField).filter(Boolean));
  return PLAYER_FIELDS.filter((definition) => definition.required && !assigned.has(definition.field));
}

/** 同じ項目に2つ以上の列が割り当てられていないか。 */
export function duplicateAssignments(mappings: MappingSuggestion[]): PlayerField[] {
  const counts = new Map<PlayerField, number>();
  for (const mapping of mappings) {
    if (!mapping.targetField) continue;
    counts.set(mapping.targetField, (counts.get(mapping.targetField) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([field]) => field);
}

export function fieldLabel(field: PlayerField): string {
  return PLAYER_FIELDS.find((definition) => definition.field === field)?.label ?? field;
}
