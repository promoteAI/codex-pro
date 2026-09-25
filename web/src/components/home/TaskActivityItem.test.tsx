import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { TaskActivityItem } from "./TaskActivityItem";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TaskActivityItem", () => {
  it("toggles is-open on tr-head click (running too)", () => {
    const { container } = render(
      <TaskActivityItem title="exec" toolName="exec" input={"echo hi"} output="" running />,
    );
    const head = container.querySelector("button.tr-head") as HTMLElement;
    const row = container.querySelector(".tr-row") as HTMLElement;
    expect(row.className).toContain("is-open");
    fireEvent.click(head);
    expect(row.className).not.toContain("is-open");
    fireEvent.click(head);
    expect(row.className).toContain("is-open");
  });

  it("renders detail body when open", () => {
    const { container } = render(
      <TaskActivityItem title="exec" toolName="exec" input={"echo hi"} output="hi" running={false} />,
    );
    const detail = container.querySelector(".tr-detail") as HTMLElement;
    expect(detail).toBeTruthy();
  });
});
