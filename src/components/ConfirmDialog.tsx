import { type KeyboardEvent, type RefObject, useId, useRef, useState } from "react";
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
  /**
   * 閉じたときにフォーカスを戻す要素。AlertDialogTrigger を使わずに開く（起点がボタン以外や、2 段階の確認）ときに渡す。
   * 渡さなければ Radix の既定（トリガーがなければ body）
   */
  returnFocusTo?: RefObject<HTMLElement | null>;
  /** 確定後の処理中。キャンセル・Esc・外側の操作で閉じられなくし、ボタンと入力欄を無効にする */
  busy?: boolean;
  /** 処理中に確定ボタンに出す文言（「削除しています」など）。省略すると confirmLabel のまま */
  busyLabel?: string;
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
  returnFocusTo,
  busy = false,
  busyLabel,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // 処理中は閉じない（閉じたように見えて処理が続くのを防ぐ）
        if (!next && !busy) onCancel();
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
          returnFocusTo={returnFocusTo}
          busy={busy}
          busyLabel={busyLabel}
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
  returnFocusTo,
  busy,
  busyLabel,
  onConfirm,
}: Omit<Props, "open" | "onCancel">) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const messageId = useId();
  // 前後の空白も一致とみなさない（完全一致）
  const matched = confirmInput === undefined || value === confirmInput;

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // IME の変換確定の Enter では確定しない。Safari は compositionend が keydown より先に発火して
    // isComposing が false になることがあるが、そのときは keyCode が 229（WebKit bug 165004）
    if (
      event.key !== "Enter" ||
      event.nativeEvent.isComposing ||
      event.nativeEvent.keyCode === 229
    ) {
      return;
    }
    event.preventDefault();
    if (matched && !busy) onConfirm();
  };

  return (
    <AlertDialogContent
      // 本文の id を自前にしたので、Radix が自動で付ける aria-describedby も同じ id に向ける
      aria-describedby={messageId}
      aria-busy={busy || undefined}
      onOpenAutoFocus={(event) => {
        if (confirmInput === undefined) return;
        // 既定（キャンセルにフォーカス）の代わりに入力欄へ渡す（画面設計書 8 章）
        event.preventDefault();
        inputRef.current?.focus();
      }}
      onCloseAutoFocus={(event) => {
        // 閉じたら起点へ戻す（画面設計書 8 章）。2 段階目へ進むときは、続けて開く 2 段階目が入力欄へ移す
        if (!returnFocusTo?.current) return;
        event.preventDefault();
        returnFocusTo.current.focus();
      }}
    >
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription id={messageId}>{message}</AlertDialogDescription>
      </AlertDialogHeader>
      {confirmInput !== undefined && (
        <Input
          ref={inputRef}
          // 既定の枠 --input は白で約 1.26:1 と、操作部品の輪郭に必要な 3:1 を満たさない（画面設計書 2.2 節）。
          // --muted-foreground はライト 4.73:1、ダーク 7.63:1。アプリ全体の統一は Issue #72
          className="border-muted-foreground"
          aria-labelledby={messageId}
          autoComplete="off"
          disabled={busy}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
        />
      )}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={busy}>キャンセル</AlertDialogCancel>
        <AlertDialogAction
          variant={danger ? "destructive" : "default"}
          disabled={!matched || busy}
          onClick={(event) => {
            // 既定の自動クローズ（onOpenChange(false) → onCancel）を止め、確定だけを呼び出し元に伝える
            event.preventDefault();
            onConfirm();
          }}
        >
          {busy ? (busyLabel ?? confirmLabel) : confirmLabel}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  );
}
