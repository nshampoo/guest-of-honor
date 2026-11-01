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
