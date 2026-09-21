import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ClarifyCard } from "./ClarifyCard";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ClarifyCard", () => {
  it("renders question and options", () => {
    const onAnswer = vi.fn();
    render(<ClarifyCard id="c-1" question="选哪个?" options={["A", "B"]} onAnswer={onAnswer} />);
    expect(screen.getByText(/选哪个/)).toBeTruthy();
    expect(screen.getByText(/A/)).toBeTruthy();
    expect(screen.getByText(/B/)).toBeTruthy();
  });

  it("clicking an option answers with that value", () => {
    const onAnswer = vi.fn();
    render(<ClarifyCard id="c-1" question="选哪个?" options={["A", "B"]} onAnswer={onAnswer} />);
    // 按钮渲染为 "1. A" / "2. B"(编号前缀)，用正则匹配可访问名。
    fireEvent.click(screen.getByRole("button", { name: /2\. B/ }));
    expect(onAnswer).toHaveBeenCalledWith("B");
  });
});
