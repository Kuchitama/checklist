import { type KeyboardEvent, useId, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";

type Props = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  /** 取り消せない操作（削除など）は確定ボタンを danger にする */
  danger?: boolean;
  /** 渡すと入力欄を出し、この文字列と完全に一致するまで確定できない（全データ削除の 2 段階目） */
  confirmInput?: string;
  onConfirm: () => void;
  /** キャンセルボタン、Esc、外側の操作で閉じたときに呼ぶ */
  onCancel: () => void;
};

/**
 * 確認ダイアログ（画面設計書 4 章の ConfirmDialog、5.2 節）。
 * 開いたらキャンセルにフォーカスし、Esc でキャンセルする（5.1 節。Radix の既定の挙動）。
 * confirmInput があるときは入力欄にフォーカスし、message を入力欄のラベルにする。
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  danger,
  confirmInput,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      {/* 入力欄の値は開くたびに空にするため、中身は開いている間だけ描画する */}
      {open && (
        <ConfirmDialogBody
          title={title}
          message={message}
          confirmLabel={confirmLabel}
          danger={danger}
          confirmInput={confirmInput}
          onConfirm={onConfirm}
        />
      )}
    </AlertDialog>
  );
}

function ConfirmDialogBody({
  title,
  message,
  confirmLabel,
  danger,
  confirmInput,
  onConfirm,
}: Omit<Props, "open" | "onCancel">) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const messageId = useId();
  // 前後の空白も一致とみなさない（完全一致）
  const matched = confirmInput === undefined || value === confirmInput;

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // IME の変換確定の Enter では確定しない
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (matched) onConfirm();
  };

  return (
    <AlertDialogContent
      // 本文の id を自前にしたので、Radix が自動で付ける aria-describedby も同じ id に向ける
      aria-describedby={messageId}
      onOpenAutoFocus={(event) => {
        if (confirmInput === undefined) return;
        // 既定（キャンセルにフォーカス）の代わりに入力欄へ渡す（画面設計書 8 章）
        event.preventDefault();
        inputRef.current?.focus();
      }}
    >
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription id={messageId}>{message}</AlertDialogDescription>
      </AlertDialogHeader>
      {confirmInput !== undefined && (
        <Input
          ref={inputRef}
          aria-labelledby={messageId}
          autoComplete="off"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
        />
      )}
      <AlertDialogFooter>
        <AlertDialogCancel>キャンセル</AlertDialogCancel>
        <AlertDialogAction
          variant={danger ? "destructive" : "default"}
          disabled={!matched}
          onClick={(event) => {
            // 既定の自動クローズ（onOpenChange(false) → onCancel）を止め、確定だけを呼び出し元に伝える
            event.preventDefault();
            onConfirm();
          }}
        >
          {confirmLabel}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  );
}
