// crypto.randomUUID only exists on https or localhost, and phones reach the dev server over plain http.
export function randomId(): string {
  return [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {}
}

export function deviceId(): string {
  let id = stored("goh-device");
  if (!id) {
    id = randomId();
    store("goh-device", id);
  }
  return id;
}

export const savedRole = (code: string) => stored(`goh-role-${code}`);
export const saveRole = (code: string, role: string | null) => store(`goh-role-${code}`, role);

// A board loaded from a file on the home page; the TV and single-screen game use it instead of the sample.
export function loadedBoard(): unknown {
  const json = stored("goh-board");
  try {
    return json ? JSON.parse(json) : null;
  } catch {
    return null;
  }
}
export const saveBoard = (board: unknown) => store("goh-board", board === null ? null : JSON.stringify(board));
