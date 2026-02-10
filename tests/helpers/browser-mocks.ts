type StorageRecord = Record<string, string>;

class LocalStorageMock implements Storage {
  private store: StorageRecord = {};

  clear(): void {
    this.store = {};
  }

  getItem(key: string): string | null {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
  }

  key(index: number): string | null {
    const keys = Object.keys(this.store);
    return keys[index] ?? null;
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  setItem(key: string, value: string): void {
    this.store[key] = value;
  }

  get length(): number {
    return Object.keys(this.store).length;
  }
}

interface InstallBrowserMocksOptions {
  fetchImpl?: typeof fetch;
}

export function installBrowserMocks(options: InstallBrowserMocksOptions = {}): void {
  const localStorage = new LocalStorageMock();

  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorage,
    configurable: true,
    writable: true,
  });

  Object.defineProperty(globalThis, 'window', {
    value: { localStorage },
    configurable: true,
    writable: true,
  });

  if (options.fetchImpl) {
    Object.defineProperty(globalThis, 'fetch', {
      value: options.fetchImpl,
      configurable: true,
      writable: true,
    });
  }
}

export function resetBrowserMocks(): void {
  const localStorage = globalThis.localStorage;
  if (localStorage && typeof localStorage.clear === 'function') {
    localStorage.clear();
  }
}
