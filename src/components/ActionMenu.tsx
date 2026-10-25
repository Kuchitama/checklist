import { Ellipsis } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMediaQuery } from "@/lib/useMediaQuery";

export type ActionMenuItem = {
  label: string;
  icon: ReactNode;
  /** 取り消せない操作（削除など）は赤で出す */
  danger?: boolean;
  onSelect: () => void;
};

type Props = {
  /** トリガーの aria-label とボトムシートの見出し */
  label?: string;
  items: ActionMenuItem[];
};

/**
 * 「…」メニュー（画面設計書 4 章の ActionMenu）。
 * 幅 640px 以上ではドロップダウン、未満ではボトムシートで項目を出す（3.2 節）。
 */
export function ActionMenu({ label = "操作メニュー", items }: Props) {
  const wide = useMediaQuery("(min-width: 640px)");
  const [open, setOpen] = useState(false);
  // 項目を選んで閉じたときは、トリガーへフォーカスを戻さない。続けて開く確認ダイアログがフォーカスを受け取る
  const selected = useRef(false);
  const onCloseAutoFocus = (event: Event) => {
    if (selected.current) event.preventDefault();
    selected.current = false;
  };
  const trigger = (
    <Button variant="ghost" size="icon" aria-label={label}>
      <Ellipsis aria-hidden="true" />
    </Button>
  );

  if (wide) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent align="end" onCloseAutoFocus={onCloseAutoFocus}>
          {items.map((item) => (
            <DropdownMenuItem
              key={item.label}
              variant={item.danger ? "destructive" : "default"}
              onSelect={() => {
                selected.current = true;
                item.onSelect();
              }}
            >
              {item.icon}
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>{trigger}</DrawerTrigger>
      <DrawerContent onCloseAutoFocus={onCloseAutoFocus}>
        <DrawerTitle className="sr-only">{label}</DrawerTitle>
        <DrawerDescription className="sr-only">操作を選んでください</DrawerDescription>
        <div className="flex flex-col gap-1 p-4">
          {items.map((item, index) => (
            <Button
              key={item.label}
              variant="ghost"
              className={item.danger ? "justify-start text-destructive" : "justify-start"}
              // 開いたら最初の項目にフォーカスする（画面設計書 5.1 節）
              autoFocus={index === 0}
              onClick={() => {
                selected.current = true;
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.icon}
              {item.label}
            </Button>
          ))}
          <DrawerClose asChild>
            <Button variant="outline" className="mt-2">
              キャンセル
            </Button>
          </DrawerClose>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
