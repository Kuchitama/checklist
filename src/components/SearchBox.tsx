import { Search, X } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  value: string;
  onChange: (value: string) => void;
};

/**
 * 一覧の検索ボックス（画面設計書 3.1 節）。type="search" で、入力があればクリアボタン（×）を出す。
 * ブラウザ既定のクリアボタンは小さいので消し、44px のボタンを自前で置く
 */
export function SearchBox({ value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="relative">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        ref={inputRef}
        type="search"
        aria-label="検索"
        placeholder="リストや項目を検索"
        className="pr-11 pl-9 [&::-webkit-search-cancel-button]:appearance-none"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {value !== "" && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="検索をクリア"
          className="absolute top-0 right-0"
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
        >
          <X aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
