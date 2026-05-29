/**
 * Unit tests for src/lib/utils.ts
 *
 * cn() merges Tailwind class names, resolves conflicts, and drops falsy values.
 */
import { describe, it, expect } from 'vitest';
import { cn } from '../lib/utils';

describe('cn()', () => {
  it('returns a string for a single class', () => {
    expect(cn('flex')).toBe('flex');
  });

  it('joins multiple classes with a space', () => {
    expect(cn('flex', 'items-center', 'gap-4')).toBe('flex items-center gap-4');
  });

  it('ignores falsy values (undefined, null, false)', () => {
    expect(cn('flex', undefined, null, false, 'gap-4')).toBe('flex gap-4');
  });

  it('handles conditional class objects', () => {
    expect(cn('base', { 'text-red-500': true, 'text-green-500': false }))
      .toBe('base text-red-500');
  });

  it('resolves Tailwind conflicts — last class wins', () => {
    // tailwind-merge keeps the later, more specific class
    const result = cn('p-4', 'p-8');
    expect(result).toBe('p-8');
  });

  it('resolves text-colour conflicts', () => {
    const result = cn('text-gray-500', 'text-red-500');
    expect(result).toBe('text-red-500');
  });

  it('returns empty string when no arguments provided', () => {
    expect(cn()).toBe('');
  });

  it('handles array inputs', () => {
    expect(cn(['flex', 'gap-2'])).toBe('flex gap-2');
  });
});
