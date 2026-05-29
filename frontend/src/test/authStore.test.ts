/**
 * Unit tests for src/store/authStore.ts
 *
 * Tests Zustand store actions: setAuth, logout, and initial state from localStorage.
 */
import { describe, it, expect, beforeEach } from 'vitest';

const FAKE_USER = { id: 1, name: 'Alice', email: 'alice@example.com' };
const FAKE_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.test.signature';

describe('useAuthStore', () => {
  beforeEach(() => {
    // Clear localStorage and reset the store before each test
    localStorage.clear();
    // Re-import the store so it reinitialises from the now-empty localStorage
    vi.resetModules();
  });

  it('has null user and token when localStorage is empty', async () => {
    const { useAuthStore } = await import('../store/authStore');
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.token).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  it('setAuth stores user and token in state and localStorage', async () => {
    const { useAuthStore } = await import('../store/authStore');
    useAuthStore.getState().setAuth(FAKE_USER, FAKE_TOKEN);

    const state = useAuthStore.getState();
    expect(state.user).toEqual(FAKE_USER);
    expect(state.token).toBe(FAKE_TOKEN);
    expect(state.isAuthenticated).toBe(true);

    expect(localStorage.getItem('token')).toBe(FAKE_TOKEN);
    expect(JSON.parse(localStorage.getItem('user')!)).toEqual(FAKE_USER);
  });

  it('logout clears user, token, and localStorage', async () => {
    const { useAuthStore } = await import('../store/authStore');
    useAuthStore.getState().setAuth(FAKE_USER, FAKE_TOKEN);
    useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.token).toBeNull();
    expect(state.isAuthenticated).toBe(false);

    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });

  it('reads existing token from localStorage on initialisation', async () => {
    localStorage.setItem('token', FAKE_TOKEN);
    localStorage.setItem('user', JSON.stringify(FAKE_USER));

    const { useAuthStore } = await import('../store/authStore');
    const state = useAuthStore.getState();

    expect(state.token).toBe(FAKE_TOKEN);
    expect(state.user).toEqual(FAKE_USER);
    expect(state.isAuthenticated).toBe(true);
  });

  it('handles corrupted user JSON in localStorage without throwing', async () => {
    localStorage.setItem('user', 'not-valid-json{{');
    const { useAuthStore } = await import('../store/authStore');
    const state = useAuthStore.getState();
    // Should fall back to null rather than crash
    expect(state.user).toBeNull();
  });
});
