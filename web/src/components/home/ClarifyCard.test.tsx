import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ClarifyCard } from "./ClarifyCard";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ClarifyCard", () => {
  it("renders question and numbered options with a free-text row", () => {
    render(<ClarifyCard id="c-1" question="选哪个?" options={["A", "B"]} onAnswer={vi.fn()} />);
    expect(screen.getByText(/选哪个/)).toBeTruthy();
    expect(screen.getByText("A")).toBeTruthy();
    expect(screen.getByText("B")).toBeTruthy();
    expect(screen.getByPlaceholderText("或自己输入…")).toBeTruthy();
    expect(screen.getByText("Q1")).toBeTruthy();
  });

  it("selecting an option + note submits the combined answer", () => {
    const onAnswer = vi.fn();
    render(<ClarifyCard id="c-1" question="选哪个?" options={["A", "B"]} onAnswer={onAnswer} />);
    fireEvent.click(screen.getByText("B"));
    fireEvent.change(screen.getByPlaceholderText("补充说明"), { target: { value: "备注X" } });
    fireEvent.click(screen.getByRole("button", { name: /提交/ }));
    expect(onAnswer).toHaveBeenCalledWith("B（补充说明: 备注X）");
  });

  it("free-text row answers without an option selected", () => {
    const onAnswer = vi.fn();
    render(<ClarifyCard id="c-1" question="选哪个?" options={["A"]} onAnswer={onAnswer} />);
    fireEvent.change(screen.getByPlaceholderText("或自己输入…"), { target: { value: "我自己答" } });
    fireEvent.click(screen.getByRole("button", { name: /提交/ }));
    expect(onAnswer).toHaveBeenCalledWith("我自己答");
  });

  it("skipping replies with the skip sentinel (model decides)", () => {
    const onAnswer = vi.fn();
    render(<ClarifyCard id="c-1" question="选哪个?" options={["A"]} onAnswer={onAnswer} />);
    fireEvent.click(screen.getByRole("button", { name: /跳过/ }));
    expect(onAnswer).toHaveBeenCalledWith("用户未作答，请你自行决定");
  });

  it("Esc skips and Enter submits while the card has focus", () => {
    const onAnswer = vi.fn();
    render(<ClarifyCard id="c-1" question="选哪个?" options={["A"]} onAnswer={onAnswer} />);
    const card = screen.getByTestId("clarify-c-1");
    fireEvent.keyDown(card, { key: "Enter" });
    expect(onAnswer).not.toHaveBeenCalled();
    onAnswer.mockClear();
    fireEvent.click(screen.getByText("A"));
    fireEvent.keyDown(card, { key: "Enter" });
    expect(onAnswer).toHaveBeenCalledWith("A");
    onAnswer.mockClear();
    fireEvent.keyDown(card, { key: "Escape" });
    expect(onAnswer).toHaveBeenCalledWith("用户未作答，请你自行决定");
  });

  it("submit is disabled until something is chosen or typed", () => {
    render(<ClarifyCard id="c-1" question="选哪个?" options={["A"]} onAnswer={vi.fn()} />);
    expect(screen.getByRole("button", { name: /提交/ })).toBeDisabled();
  });
});
