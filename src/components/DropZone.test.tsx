import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DropZone } from "./DropZone";

const file = (name = "a.json") => new File(["{}"], name, { type: "application/json" });

/** dataTransfer を持つドラッグ系のイベントを起こす（jsdom は DragEvent を持たない） */
function drag(
  target: Element,
  type: "dragenter" | "dragover" | "dragleave" | "drop",
  files: File[] = [],
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: { files, types: ["Files"] } });
  fireEvent(target, event);
  return event;
}

describe("DropZone", () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it("ドロップされたファイルの先頭 1 件を onFile に渡し、既定の動作（ブラウザで開く）を止める", () => {
    const onFile = vi.fn();
    render(<DropZone accept=".json" onFile={onFile} />);
    const zone = screen.getByTestId("drop-zone");

    const over = drag(zone, "dragover");
    const drop = drag(zone, "drop", [file("first.json"), file("second.json")]);

    expect(over.defaultPrevented).toBe(true);
    expect(drop.defaultPrevented).toBe(true);
    expect(onFile).toHaveBeenCalledTimes(1);
    expect(onFile.mock.calls[0]?.[0]?.name).toBe("first.json");
  });

  it("ドラッグオーバー中は枠の表示が変わり、離れるかドロップすると戻る", () => {
    render(<DropZone accept=".json" onFile={() => {}} />);
    const zone = screen.getByTestId("drop-zone");

    drag(zone, "dragenter");
    expect(zone).toHaveAttribute("data-over", "true");
    // 子要素への出入りで dragleave が来ても、領域の外へ出るまでは保つ
    drag(zone, "dragenter");
    drag(zone, "dragleave");
    expect(zone).toHaveAttribute("data-over", "true");
    drag(zone, "dragleave");
    expect(zone).toHaveAttribute("data-over", "false");

    drag(zone, "dragenter");
    drag(zone, "drop", [file()]);
    expect(zone).toHaveAttribute("data-over", "false");
  });

  it("検証中はドロップを受け付けない", () => {
    const onFile = vi.fn();
    render(<DropZone accept=".json" busy onFile={onFile} />);

    drag(screen.getByTestId("drop-zone"), "drop", [file()]);

    expect(onFile).not.toHaveBeenCalled();
  });

  it("ファイルのないドロップ（文字列など）は無視する", () => {
    const onFile = vi.fn();
    render(<DropZone accept=".json" onFile={onFile} />);

    drag(screen.getByTestId("drop-zone"), "drop", []);

    expect(onFile).not.toHaveBeenCalled();
  });

  it("スマートフォン（hover: none かつ pointer: coarse）では文言を「ファイルを選択してください」にする", () => {
    window.matchMedia = (query: string) =>
      ({
        ...originalMatchMedia(query),
        matches: query === "(hover: none) and (pointer: coarse)",
      }) as MediaQueryList;
    render(<DropZone accept=".json" onFile={() => {}} />);

    expect(screen.getByText("ファイルを選択してください")).toBeInTheDocument();
    expect(screen.queryByText(/ここにファイルをドロップ/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("ファイルを選択")).toBeInTheDocument();
  });

  it("PC では「ここにファイルをドロップ または」を出す", () => {
    render(<DropZone accept=".json" onFile={() => {}} />);

    expect(screen.getByText(/ここにファイルをドロップ/)).toBeInTheDocument();
    expect(screen.getByText(/または/)).toBeInTheDocument();
  });
});
