/**
 * ページを再読み込みする。jsdom の location.reload は差し替えられないので、テストでモックできるよう関数に分ける
 */
export function reloadPage(): void {
  window.location.reload();
}
