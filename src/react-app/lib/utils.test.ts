import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("lets text-display replace another font size, as it does for a built-in one", () => {
    expect(cn("text-base", "text-display")).toBe("text-display");
    expect(cn("md:text-sm", "md:text-display")).toBe("md:text-display");
  });

  it("still resolves text-micro against a size and keeps a colour beside a size", () => {
    expect(cn("text-sm", "text-micro")).toBe("text-micro");
    expect(cn("text-display", "text-muted-foreground")).toBe("text-display text-muted-foreground");
  });
});
