// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import HomePage from "@/app/page";

it("サービス名と人間確認を含む5段階の流れを表示する", () => {
  render(<HomePage />);
  expect(screen.getByRole("heading", { level: 1, name: "AIプロジェクトマネージャー" })).toBeVisible();
  expect(screen.getAllByRole("listitem")).toHaveLength(5);
  expect(screen.getByText("Human Review")).toBeVisible();
});
