import { describe, it, expect } from 'vitest';

// Smoke test — proves the Vitest + jsdom + jest-dom harness is wired up before
// the Content Creator wizard tests are added.
describe('content creator test harness', () => {
  it('runs assertions', () => {
    expect(1 + 1).toBe(2);
  });

  it('has a jsdom document', () => {
    const el = document.createElement('div');
    el.textContent = 'pixie';
    document.body.appendChild(el);
    expect(el).toBeInTheDocument();
    expect(el).toHaveTextContent('pixie');
  });
});
