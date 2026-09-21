import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ApprovalCard } from "./ApprovalCard";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ApprovalCard", () => {
  it("renders tool, params and risk", () => {
    const onDecide = vi.fn();
    render(
      <ApprovalCard
        id="req-1"
        tool="exec"
        params={{ command: "rm -rf /tmp/x" }}
        risk="exec"
        onDecide={onDecide}
      />,
    );
    expect(screen.getByText(/需要确认执行/)).toBeTruthy();
    expect(screen.getByText(/rm -rf/)).toBeTruthy();
    expect(screen.getByText(/风险/)).toBeTruthy();
  });

  it("onDecide('once') fires approve", () => {
    const onDecide = vi.fn();
    render(<ApprovalCard id="req-1" tool="exec" params={{}} risk="exec" onDecide={onDecide} />);
    fireEvent.click(screen.getByRole("button", { name: /仅本次/i }));
    expect(onDecide).toHaveBeenCalledWith("once");
  });

  it("onDecide('session') fires approve session", () => {
    const onDecide = vi.fn();
    render(<ApprovalCard id="req-1" tool="exec" params={{}} risk="exec" onDecide={onDecide} />);
    fireEvent.click(screen.getByRole("button", { name: /本会话/i }));
    expect(onDecide).toHaveBeenCalledWith("session");
  });
});
