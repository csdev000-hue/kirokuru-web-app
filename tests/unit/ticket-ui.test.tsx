// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
import { Board, type Card } from "@/components/tickets/client";
import { isOverdue, todayInJapan } from "@/lib/utils/ticket-date";
import { createTicketSchema } from "@/lib/validators/ticket";
afterEach(cleanup);
const card: Card = { id: "id", title: "<script>alert(1)</script>", description: null, status: "todo", type: "task", priority: "high", assignee: null, dueDate: "2026-09-14" };
it("KBN-T04 optimistic失敗rollbackとXSS安全表示", async () => {
 let resolve!: (value: Response) => void; vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((r) => { resolve = r; })));
 render(<Board tickets={[card]} editable today="2026-09-15" />);
 fireEvent.change(screen.getByRole("combobox"), { target: { value: "in_progress" } });
 expect(within(screen.getByRole("region", { name: "in_progress" })).getByRole("link")).toHaveTextContent(card.title);
 resolve(new Response(null, { status: 403 })); await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("元の状態に戻しました"));
 expect(within(screen.getByRole("region", { name: "todo" })).getByRole("link")).toHaveTextContent(card.title); expect(document.querySelector("script")).toBeNull();
});
it("viewerは状態変更UIなし", () => { render(<Board tickets={[card]} editable={false} today="2026-09-15" />); expect(screen.queryByRole("combobox")).toBeNull(); });
it("日付はJST境界・完了済みは期限切れではない", () => { expect(todayInJapan(new Date("2026-09-14T15:00:00Z"))).toBe("2026-09-15"); expect(isOverdue("2026-09-14", "todo", "2026-09-15")).toBe(true); expect(isOverdue("2026-09-14", "done", "2026-09-15")).toBe(false); });
it("名称と実在日付を検証", () => { expect(createTicketSchema.safeParse({ title: " ", type: "task" }).success).toBe(false); expect(createTicketSchema.safeParse({ title: "x", type: "task", dueDate: "2026-02-30" }).success).toBe(false); });
