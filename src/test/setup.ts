import "@testing-library/jest-dom";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// jsdom does not implement scrollIntoView (used to keep the chat pinned to the
// newest message).
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// Node >= 22 exposes an experimental Web Storage global that shadows jsdom's
// implementation under vitest and lacks the Storage methods unless a
// --localstorage-file is configured. Provide a real in-memory Storage so the
// app code (which uses window.localStorage / sessionStorage) behaves normally.
class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(String(key), String(value));
  }
}

for (const name of ["localStorage", "sessionStorage"] as const) {
  const targets: Array<Record<string, unknown>> = [globalThis as unknown as Record<string, unknown>];
  if (typeof window !== "undefined" && (window as unknown) !== globalThis) {
    targets.push(window as unknown as Record<string, unknown>);
  }
  for (const target of targets) {
    const existing = target[name] as Partial<Storage> | undefined;
    if (!existing || typeof existing.clear !== "function" || typeof existing.getItem !== "function") {
      Object.defineProperty(target, name, { value: new MemoryStorage(), configurable: true, writable: true });
    }
  }
}
