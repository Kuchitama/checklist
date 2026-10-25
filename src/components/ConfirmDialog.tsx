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

type Props = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  /** 取り消せない操作（削除など）は確定ボタンを danger にする */
  danger?: boolean;
  onConfirm: () => void;
  /** キャンセルボタン、Esc、外側の操作で閉じたときに呼ぶ */
  onCancel: () => void;
};

/**
 * 確認ダイアログ（画面設計書 4 章の ConfirmDialog、5.2 節）。
 * 開いたらキャンセルにフォーカスし、Esc でキャンセルする（5.1 節。Radix の既定の挙動）。
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  danger,
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
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>キャンセル</AlertDialogCancel>
          <AlertDialogAction
            variant={danger ? "destructive" : "default"}
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
    </AlertDialog>
  );
}
