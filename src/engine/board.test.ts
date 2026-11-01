import { describe, expect, it } from "vitest";
import { validateBoard } from "./board";
import sample from "../boards/sample.json";

const copy = () => structuredClone(sample);

describe("validateBoard", () => {
  it("accepts the sample board", () => {
    expect(validateBoard(sample)).toEqual([]);
  });

  it("rejects non-objects", () => {
    expect(validateBoard(null)).toEqual(["board must be an object"]);
  });

  it("needs six categories", () => {
    const b = copy();
    b.categories.pop();
    expect(validateBoard(b)).toContain("need exactly 6 categories");
  });

  it("needs values in order", () => {
    const b = copy();
    b.categories[0].clues[1].value = 500;
    expect(validateBoard(b)).toContain("category 1 clue 2: value should be 400");
  });

  it("needs a clue and answer", () => {
    const b = copy();
    b.categories[2].clues[0].answer = " ";
    expect(validateBoard(b)).toContain("category 3 clue 1: missing answer");
  });

  it("needs a final category", () => {
    const b = copy();
    b.final.category = "";
    expect(validateBoard(b)).toContain("final: missing category");
  });
});
