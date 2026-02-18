declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  cwd(): string;
  stderr: { write(message: string): void };
  stdout: { write(message: string): void };
  exitCode?: number;
};

declare module 'node:test' {
  const test: {
    (name: string, fn?: (...args: any[]) => any): any;
    beforeEach(fn: (...args: any[]) => any): void;
  };
  export default test;
  export const before: (fn: (...args: any[]) => any) => void;
  export const beforeEach: (fn: (...args: any[]) => any) => void;
  export const after: (fn: (...args: any[]) => any) => void;
  export const afterEach: (fn: (...args: any[]) => any) => void;
}

declare module 'node:assert/strict' {
  const assert: any;
  export = assert;
}

declare module 'node:fs/promises' {
  const fs: any;
  export default fs;
}

declare module 'node:path' {
  const path: any;
  export default path;
}
