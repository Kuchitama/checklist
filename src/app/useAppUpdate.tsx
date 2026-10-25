import { useRegisterSW } from "virtual:pwa-register/react";
import { useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** 更新通知のトーストの id。同じ更新で 2 回出さないために固定する */
export const UPDATE_TOAST_ID = "app-update";

/**
 * Service Worker の登録と更新通知（仕様書 7 章、画面設計書 5.3 節、7.4 節）。
 * 新しい SW が waiting になったら「新しいバージョンがあります」[再読み込み] を消えないトーストで出し、
 * 利用者が押したときだけ skipWaiting → controllerchange → 再読み込みする（自動では反映しない）。
 * App（ルートのレイアウト）から呼び、トーストは画面遷移をまたいで残る。通知の状態は永続化しない（データ設計書 6 章）。
 */
export function useAppUpdate() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    if (!needRefresh) return;
    toast("新しいバージョンがあります", {
      id: UPDATE_TOAST_ID,
      duration: Number.POSITIVE_INFINITY,
      // sonner の既定の操作ボタンは高さ 24px なので、44px の Button を使う（画面設計書 2.1 節）
      action: (
        <Button size="default" className="ml-auto" onClick={() => void updateServiceWorker(true)}>
          再読み込み
        </Button>
      ),
    });
  }, [needRefresh, updateServiceWorker]);
}
