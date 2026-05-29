/**
 * Component tests for pages/auth/Login.tsx
 *
 * Covers: render, form interaction, successful login, failed login.
 * vi.hoisted() is used so mock functions are available inside vi.mock factories
 * (vi.mock calls are hoisted to the top of the file by Vitest).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ── Hoisted mock functions (available before vi.mock factories run) ───────────

const mockNavigate      = vi.hoisted(() => vi.fn());
const mockToastSuccess  = vi.hoisted(() => vi.fn());
const mockToastError    = vi.hoisted(() => vi.fn());
const mockGoogleLogin   = vi.hoisted(() => vi.fn());
const mockAuthApiLogin  = vi.hoisted(() => vi.fn());
const mockAuthApiGoogle = vi.hoisted(() => vi.fn());
const mockSetAuth       = vi.hoisted(() => vi.fn());

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock('sonner', () => ({
  toast: { success: mockToastSuccess, error: mockToastError },
}));

vi.mock('@react-oauth/google', () => ({
  useGoogleLogin: (opts: { onSuccess: (t: { access_token: string }) => void }) => {
    mockGoogleLogin.mockImplementation(() =>
      opts.onSuccess({ access_token: 'google-token' })
    );
    return mockGoogleLogin;
  },
}));

vi.mock('../services/api', () => ({
  authApi: { login: mockAuthApiLogin, googleLogin: mockAuthApiGoogle },
}));

vi.mock('../store/authStore', () => ({
  useAuthStore: () => ({ setAuth: mockSetAuth }),
}));

// ── Component import (after mocks) ───────────────────────────────────────────

import Login from '../pages/auth/Login';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Login page', () => {
  beforeEach(() => vi.clearAllMocks());

  // ── Render ────────────────────────────────────────────────────────────────

  it('renders the email and password inputs', () => {
    render(<Login />);
    expect(screen.getByPlaceholderText('Enter your email')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument();
  });

  it('renders the Sign in button', () => {
    render(<Login />);
    // Use exact string so it doesn't also match "Sign in with Google"
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('renders the Sign in with Google button', () => {
    render(<Login />);
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
  });

  it('has a link to the register page', () => {
    render(<Login />);
    expect(screen.getByRole('link', { name: /sign up/i })).toHaveAttribute('href', '/register');
  });

  // ── Password toggle ───────────────────────────────────────────────────────

  it('toggles password field visibility when the eye icon is clicked', async () => {
    const user = userEvent.setup();
    render(<Login />);

    const passwordInput = screen.getByPlaceholderText('Enter your password');
    expect(passwordInput).toHaveAttribute('type', 'password');

    // Find the toggle button (not the submit and not the Google button)
    const toggleBtn = screen.getAllByRole('button').find(
      (btn) =>
        !btn.textContent?.toLowerCase().includes('sign in') &&
        !btn.textContent?.toLowerCase().includes('google')
    )!;
    await user.click(toggleBtn);
    expect(passwordInput).toHaveAttribute('type', 'text');
  });

  // ── Successful login ──────────────────────────────────────────────────────

  it('calls authApi.login with entered credentials on submit', async () => {
    const user = userEvent.setup();
    mockAuthApiLogin.mockResolvedValueOnce({
      data: { user: { id: 1, name: 'Alice', email: 'alice@example.com' }, access_token: 'tok' },
    });

    render(<Login />);
    await user.type(screen.getByPlaceholderText('Enter your email'), 'alice@example.com');
    await user.type(screen.getByPlaceholderText('Enter your password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() =>
      expect(mockAuthApiLogin).toHaveBeenCalledWith('alice@example.com', 'password123')
    );
  });

  it('calls setAuth and navigates to /dashboard on success', async () => {
    const user = userEvent.setup();
    const fakeUser = { id: 1, name: 'Alice', email: 'alice@example.com' };
    mockAuthApiLogin.mockResolvedValueOnce({
      data: { user: fakeUser, access_token: 'tok123' },
    });

    render(<Login />);
    await user.type(screen.getByPlaceholderText('Enter your email'), 'alice@example.com');
    await user.type(screen.getByPlaceholderText('Enter your password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(mockSetAuth).toHaveBeenCalledWith(fakeUser, 'tok123');
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('shows a success toast with the first name on successful login', async () => {
    const user = userEvent.setup();
    mockAuthApiLogin.mockResolvedValueOnce({
      data: { user: { id: 1, name: 'Alice Smith', email: 'a@b.com' }, access_token: 'tok' },
    });

    render(<Login />);
    await user.type(screen.getByPlaceholderText('Enter your email'), 'a@b.com');
    await user.type(screen.getByPlaceholderText('Enter your password'), 'pass');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith(expect.stringContaining('Alice'))
    );
  });

  // ── Failed login ──────────────────────────────────────────────────────────

  it('shows error message from API on failed login', async () => {
    const user = userEvent.setup();
    mockAuthApiLogin.mockRejectedValueOnce({
      response: { data: { detail: 'Invalid email or password' } },
    });

    render(<Login />);
    await user.type(screen.getByPlaceholderText('Enter your email'), 'bad@example.com');
    await user.type(screen.getByPlaceholderText('Enter your password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Invalid email or password');
      expect(screen.getByText('Invalid email or password')).toBeInTheDocument();
    });
  });

  it('does NOT navigate on failed login', async () => {
    const user = userEvent.setup();
    mockAuthApiLogin.mockRejectedValueOnce({
      response: { data: { detail: 'Bad credentials' } },
    });

    render(<Login />);
    await user.type(screen.getByPlaceholderText('Enter your email'), 'x@x.com');
    await user.type(screen.getByPlaceholderText('Enter your password'), 'bad');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
