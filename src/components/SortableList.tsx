import {
  type Announcements,
  closestCenter,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  type UniqueIdentifier,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { type ReactNode, useRef, useState } from "react";

type Props = {
  /** 並び順。各行の useSortable に渡す id と同じもの */
  ids: string[];
  /** 行を from から to へ動かす（to は動かした後の位置） */
  onReorder: (from: number, to: number) => void;
  children: ReactNode;
};

/**
 * ハンドルにフォーカスしたときに読み上げる操作説明（画面設計書 8 章）。
 * dnd-kit が各行の aria-describedby で指す要素に入る
 */
const INSTRUCTIONS =
  "並び替えるには、Space を押して項目を持ち上げ、上下の矢印キーで動かし、もう一度 Space を押して置きます。Esc で取り消します。";

/** dnd-kit 自身の読み上げ領域は aria-live="assertive" で変えられないため、何も流さず、下の polite の領域で読み上げる */
const SILENT: Announcements = {
  onDragStart: () => undefined,
  onDragOver: () => undefined,
  onDragEnd: () => undefined,
  onDragCancel: () => undefined,
};

/**
 * 縦 1 列の並び替え（画面設計書 3.3 節、4 章の SortableList）。dnd-kit のラッパ。
 * マウスはハンドルを押してドラッグ、タッチは 150ms の長押しで開始（スクロールと区別する）、
 * キーボードは Space で持ち上げ → ↑↓ で移動 → Space で確定、Esc で取り消し。
 * 操作中の位置は aria-live="polite" で日本語で読み上げる（画面設計書 8 章）。
 */
export function SortableList({ ids, onReorder, children }: Props) {
  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [announcement, setAnnouncement] = useState("");
  // 最後に読み上げた位置。持ち上げた直後や同じ位置の onDragOver が続けて来ても、同じことを繰り返さない
  const lastPosition = useRef(0);

  // ドラッグ中は ids を変えないので、位置は持ち上げた時点の並びで数える（1 始まり）
  const position = (id: UniqueIdentifier) => ids.indexOf(String(id)) + 1;

  const onDragStart = ({ active }: DragStartEvent) => {
    lastPosition.current = position(active.id);
    setAnnouncement(`項目 ${lastPosition.current} を持ち上げました`);
  };
  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const from = position(active.id);
    const to = position(over.id);
    if (to === lastPosition.current) return;
    lastPosition.current = to;
    setAnnouncement(
      from === to ? `項目 ${from} は元の位置です` : `項目 ${from} を ${to} 番目に移動しました`,
    );
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const from = position(active.id);
    const to = over ? position(over.id) : from;
    if (from !== to) onReorder(from - 1, to - 1);
    setAnnouncement(
      from === to
        ? `項目 ${from} を元の位置に置きました`
        : `項目 ${from} を ${to} 番目に置きました`,
    );
  };
  const onDragCancel = () => {
    setAnnouncement("並び替えを取り消しました");
  };

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        accessibility={{
          announcements: SILENT,
          screenReaderInstructions: { draggable: INSTRUCTIONS },
        }}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {children}
        </SortableContext>
      </DndContext>
      <p
        role="status"
        aria-label="並び替え"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </p>
    </>
  );
}
