// Runs before every test file (vite.config.ts, test.setupFiles).
//
// Many tests here are long synchronous simulations. Between tests vitest only awaits promises (microtasks), so a file
// full of them never lets the worker read the main process's replies (macrotasks). On a slow CI runner a file like
// balance.test.ts runs for a minute that way, and the worker's "onTaskUpdate" call times out even though every test
// passes. A zero-delay timer after each test lets those replies through.
import { afterEach } from 'vitest';

afterEach(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
