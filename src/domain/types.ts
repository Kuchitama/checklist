/**
 * ドメインの型。制約と正規化の詳細はデータ設計書 1 章を参照。
 */

/** チェックリスト本体。IndexedDB には 1 リスト = 1 ドキュメントで保存する */
export type Checklist = {
  /** UUID v4。作成後は不変 */
  id: string;
  /** 1〜100 文字（コードポイント数） */
  title: string;
  /** 0〜1000 文字。空文字可 */
  description: string;
  /** 各 1〜30 文字。重複なし。最大 20 個 */
  tags: string[];
  /** 配列の順序 = 表示順。最大 500 件 */
  items: ChecklistItem[];
  /** ISO 8601（UTC） */
  createdAt: string;
  /** ISO 8601（UTC）。すべての書き込みで更新する */
  updatedAt: string;
};

export type ChecklistItem = {
  /** UUID v4。リスト内で一意 */
  id: string;
  /** 1〜200 文字 */
  title: string;
  /** 0〜2000 文字。複数行可 */
  note: string;
  /** http(s) の絶対 URL。最大 2000 文字 */
  url: string | null;
  /** "YYYY-MM-DD"。暦として存在する日付 */
  dueDate: string | null;
  checked: boolean;
  /** checked が false のとき必ず null */
  checkedAt: string | null;
};

/** 編集画面と読み込みから渡される、保存前のリスト（データ設計書 1.4 節） */
export type ChecklistInput = {
  title: string;
  description: string;
  tags: string[];
  items: ChecklistItemInput[];
};

/** id を持つ項目は既存項目。持たない項目は新規項目 */
export type ChecklistItemInput = {
  id?: string;
  title: string;
  note: string;
  url: string | null;
  dueDate: string | null;
};

/** 書き出しファイル（仕様書 4 章、データ設計書 5.1 節）。チェック状態と id・時刻を含まない */
export type ExportFile = {
  format: "checklist-export";
  version: 1;
  /** ISO 8601（UTC） */
  exportedAt: string;
  checklist: {
    title: string;
    description: string;
    tags: string[];
    items: {
      title: string;
      note: string;
      url: string | null;
      dueDate: string | null;
    }[];
  };
};

export type ValidationIssue = {
  /** 例: ["title"], ["items", 3, "url"] */
  path: (string | number)[];
  code:
    | "required"
    | "too_long"
    | "too_many"
    | "invalid_url"
    | "invalid_date"
    | "invalid_type"
    | "unknown_id";
  /** 画面にそのまま出す日本語 */
  message: string;
};
