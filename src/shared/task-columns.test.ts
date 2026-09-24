import { describe, expect, it } from "vitest";
import { nearestColumn } from "./task-columns";

// Names no default uses: placement reads category and position only, so a renamed board places tasks the same.
const board = [
  { id: "a", name: "Ideas", category: "not_started", sortOrder: 1 },
  { id: "b", name: "Waiting on client", category: "active", sortOrder: 2 },
  { id: "c", name: "Next up", category: "not_started", sortOrder: 3 },
  { id: "d", name: "Doing", category: "active", sortOrder: 4 },
  { id: "e", name: "Shipped", category: "completed", sortOrder: 7 },
];

describe("nearestColumn", () => {
  it("keeps the category and picks the nearest position, not the first column of that category", () => {
    expect(nearestColumn(board, "active", 4)?.id).toBe("d");
    expect(nearestColumn(board, "active", 2)?.id).toBe("b");
  });

  it("falls back to the nearest column of any category when the board has none of that category", () => {
    expect(nearestColumn(board.filter((c) => c.category !== "completed"), "completed", 7)?.id).toBe("d");
  });

  it("takes the first same-category column when the position is unknown", () => {
    expect(nearestColumn(board, "not_started", null)?.id).toBe("a");
  });

  it("is undefined only for an empty board", () => {
    expect(nearestColumn([], "active", 1)).toBeUndefined();
  });
});
