export type Clue = { value: number; clue: string; answer: string; accept?: string[]; source?: string };
export type Category = { title: string; clues: Clue[] };
export type FinalClue = { category: string; clue: string; answer: string; accept?: string[]; source?: string };
export type Board = { title: string; honoree: string; categories: Category[]; final: FinalClue };

export const VALUES = [200, 400, 600, 800, 1000];
export const CATEGORY_COUNT = 6;

export function blankBoard(): Board {
  return {
    title: "",
    honoree: "",
    categories: Array.from({ length: CATEGORY_COUNT }, () => ({
      title: "",
      clues: VALUES.map((value) => ({ value, clue: "", answer: "" })),
    })),
    final: { category: "", clue: "", answer: "" },
  };
}

const isText =(v: unknown): v is string => typeof v === "string" && v.trim() !== "";

function checkAnswerFields(c: Record<string, unknown>, where: string, errors: string[]) {
  if (!isText(c.clue)) errors.push(`${where}: missing clue`);
  if (!isText(c.answer)) errors.push(`${where}: missing answer`);
  if (c.accept !== undefined && !(Array.isArray(c.accept) && c.accept.every(isText))) {
    errors.push(`${where}: accept must be a list of strings`);
  }
  if (c.source !== undefined && typeof c.source !== "string") errors.push(`${where}: source must be a string`);
}

export function validateBoard(input: unknown): string[] {
  const errors: string[] = [];
  if (typeof input !== "object" || input === null) return ["board must be an object"];
  const b = input as Record<string, unknown>;
  if (!isText(b.title)) errors.push("missing title");
  if (!isText(b.honoree)) errors.push("missing honoree");

  if (!Array.isArray(b.categories) || b.categories.length !== CATEGORY_COUNT) {
    errors.push(`need exactly ${CATEGORY_COUNT} categories`);
  } else {
    b.categories.forEach((cat: Record<string, unknown>, i) => {
      if (!isText(cat?.title)) errors.push(`category ${i + 1}: missing title`);
      if (!Array.isArray(cat?.clues) || cat.clues.length !== VALUES.length) {
        errors.push(`category ${i + 1}: need exactly ${VALUES.length} clues`);
        return;
      }
      cat.clues.forEach((clue: Record<string, unknown>, j) => {
        const where = `category ${i + 1} clue ${j + 1}`;
        if (clue?.value !== VALUES[j]) errors.push(`${where}: value should be ${VALUES[j]}`);
        checkAnswerFields(clue ?? {}, where, errors);
      });
    });
  }

  const final = b.final as Record<string, unknown> | undefined;
  if (typeof final !== "object" || final === null) {
    errors.push("missing final clue");
  } else {
    if (!isText(final.category)) errors.push("final: missing category");
    checkAnswerFields(final, "final", errors);
  }
  return errors;
}
