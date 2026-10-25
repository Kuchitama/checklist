/**
 * 文字列をファイルとしてダウンロードさせる（仕様書 9 章の「ファイルダウンロードなどの小道具」）。
 * Blob の URL を a 要素の download で開き、使い終わった URL は解放する。
 */
export function downloadTextFile(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
