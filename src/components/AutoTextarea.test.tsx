import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AutoTextarea } from "./AutoTextarea";

describe("AutoTextarea", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("内容の高さに合わせ、幅が変わったときも測り直す", () => {
    let scrollHeight = 100;
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(() => scrollHeight);
    const { container } = render(<AutoTextarea value="abc" onChange={() => {}} maxRows={10} />);
    const element = container.querySelector("textarea");
    if (!element) throw new Error("textarea がない");
    expect(element.style.height).toBe("100px");

    // 画面の回転などで幅が変わると折り返しが変わるので、resize でも測り直す
    scrollHeight = 200;
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(element.style.height).toBe("200px");
  });

  it("最大行数を超えたら高さを止めてスクロールする", () => {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(() => 1000);
    const { container } = render(<AutoTextarea value="abc" onChange={() => {}} maxRows={10} />);
    const element = container.querySelector("textarea");

    // jsdom では行の高さが取れないので既定の 24px × 10 行
    expect(element?.style.height).toBe("240px");
    expect(element?.style.overflowY).toBe("auto");
  });
});
