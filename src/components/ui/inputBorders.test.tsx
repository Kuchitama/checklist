import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Checkbox } from "./checkbox";
import { Input } from "./input";
import { RadioGroup, RadioGroupItem } from "./radio-group";
import { Textarea } from "./textarea";

/**
 * 入力部品の通常時の枠（画面設計書 2.2 節、Issue #72）。
 * shadcn 既定の --input はライトの白で 1.26:1 と 3:1 に届かないので、枠は --muted-foreground（4.73:1 以上）にする。
 * 呼び出し側で個別に指定しなくても、部品の既定でこの枠になることを確かめる
 */
describe("入力部品の枠", () => {
  it.each([
    ["Input", () => render(<Input aria-label="入力" />), () => screen.getByRole("textbox")],
    ["Textarea", () => render(<Textarea aria-label="入力" />), () => screen.getByRole("textbox")],
    ["Checkbox", () => render(<Checkbox aria-label="選択" />), () => screen.getByRole("checkbox")],
    [
      "RadioGroupItem",
      () =>
        render(
          <RadioGroup aria-label="選択">
            <RadioGroupItem value="a" aria-label="a" />
          </RadioGroup>,
        ),
      () => screen.getByRole("radio"),
    ],
  ])("%s の通常時の枠は --muted-foreground で、--input を使わない", (_name, renderPart, find) => {
    renderPart();
    const element = find();
    expect(element).toHaveClass("border-muted-foreground");
    expect(element.className).not.toMatch(/(^|\s|:)border-input(\s|$)/);
  });
});
