export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(what|who|where|when) (is|are|was|were) /, "")
    .replace(/^(the|a|an) /, "");
}

function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

const typosAllowed = (length: number) => (length <= 4 ? 0 : length <= 8 ? 1 : 2);

// A suggestion for the host, who makes the final call.
export function isMatch(given: string, answer: string, accept: string[] = []): boolean {
  const g = normalize(given);
  if (!g) return false;
  return [answer, ...accept].some((a) => {
    const n = normalize(a);
    return n === g || distance(n, g) <= typosAllowed(n.length);
  });
}
