// Global test setup: register jest-dom matchers on Vitest's expect and augment
// the matcher types program-wide (so tsc sees toBeInTheDocument, etc.).
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// globals:false → RTL auto-cleanup isn't auto-registered; unmount between tests so
// renders don't accumulate in document.body (which breaks getByLabelText etc.).
afterEach(() => cleanup());
