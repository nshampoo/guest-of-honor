import { describe, expect, it } from "vitest";
import { isMatch, normalize } from "./match";

describe("normalize", () => {
  it("drops question phrasing, articles, case, and punctuation", () => {
    expect(normalize("What is the Brooklyn Bridge?")).toBe("brooklyn bridge");
    expect(normalize("Who was Roger Bannister")).toBe("roger bannister");
  });

  it("strips accents", () => {
    expect(normalize("Café")).toBe("cafe");
  });
});

describe("isMatch", () => {
  it("matches exact answers loosely", () => {
    expect(isMatch("brooklyn bridge", "Brooklyn Bridge")).toBe(true);
    expect(isMatch("26.2", "26.2")).toBe(true);
  });

  it("matches accepted alternates", () => {
    expect(isMatch("Lincoln", "Abraham Lincoln", ["Lincoln"])).toBe(true);
  });

  it("allows small typos in longer answers", () => {
    expect(isMatch("Phidippides", "Pheidippides")).toBe(true);
    expect(isMatch("Kipchgoe", "Kipchoge")).toBe(false);
    expect(isMatch("Kipchoe", "Kipchoge")).toBe(true);
  });

  it("allows no typos in short answers", () => {
    expect(isMatch("Alto", "Alta")).toBe(false);
  });

  it("rejects empty and wrong answers", () => {
    expect(isMatch("", "Alta")).toBe(false);
    expect(isMatch("Vail", "Alta")).toBe(false);
  });
});
