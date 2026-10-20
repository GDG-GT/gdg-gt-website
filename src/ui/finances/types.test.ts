import { describe, expect, it } from "vitest";
import { dollars, remaining, human, type Budget } from "./types";
describe("exact financial presentation", () => {
  it("formats cents without converting to floating point", () => {
    expect(dollars("999999999999.99")).toBe("$999,999,999,999.99");
    expect(dollars("-0.01")).toBe("−$0.01");
    expect(dollars("40.1")).toBe("$40.10");
    expect(human("team-lead-approved")).toBe("Team Lead Approved");
  });
  it("computes availability in integer cents even at large aggregate sizes", () => {
    const budget = (total: string, spent: string, reserved: string) =>
      ({ totalAmount: total, usage: { spent, reserved } }) as Budget;
    expect(remaining(budget("100.00", "40.11", "59.88"))).toBe("0.01");
    expect(remaining(budget("100.00", "100.01", "0.00"))).toBe("-0.01");
    expect(
      remaining(budget("999999999999.99", "999999999999.98", "0.00")),
    ).toBe("0.01");
  });
});
