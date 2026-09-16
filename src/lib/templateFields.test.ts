import { describe, expect, it } from "vitest";
import { planStaleFieldIds } from "./templateFields";

describe("planStaleFieldIds", () => {
  it("returns nothing stale when all existing ids are kept", () => {
    expect(planStaleFieldIds(["a", "b"], ["a", "b", "c"])).toEqual([]);
  });

  it("flags removed ids as stale", () => {
    expect(planStaleFieldIds(["a", "b", "c"], ["a"])).toEqual(["b", "c"]);
  });

  it("flags everything stale when the next set is empty", () => {
    expect(planStaleFieldIds(["a", "b"], [])).toEqual(["a", "b"]);
  });

  it("returns nothing stale when there was nothing before", () => {
    expect(planStaleFieldIds([], ["a", "b"])).toEqual([]);
  });
});
