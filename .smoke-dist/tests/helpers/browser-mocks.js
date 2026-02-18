"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.installBrowserMocks = installBrowserMocks;
exports.resetBrowserMocks = resetBrowserMocks;
class LocalStorageMock {
    constructor() {
        this.store = {};
    }
    clear() {
        this.store = {};
    }
    getItem(key) {
        return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
    }
    key(index) {
        const keys = Object.keys(this.store);
        return keys[index] ?? null;
    }
    removeItem(key) {
        delete this.store[key];
    }
    setItem(key, value) {
        this.store[key] = value;
    }
    get length() {
        return Object.keys(this.store).length;
    }
}
function installBrowserMocks(options = {}) {
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
function resetBrowserMocks() {
    const localStorage = globalThis.localStorage;
    if (localStorage && typeof localStorage.clear === 'function') {
        localStorage.clear();
    }
}
