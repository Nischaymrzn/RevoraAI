/**
 * Component tests for pages/auth/Register.tsx
 *
 * Focuses on client-side validation (password length, confirm-password match)
 * and the happy-path registration flow.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ── Hoisted mock functions ────────────────────────────────────────────────────

const mockNavigate     = vi.hoisted(() => vi.fn());
const mockToastSuccess = vi.hoisted(() => vi.fn());
const mockToastError   = vi.hoisted(() => vi.fn());
const mockRegister     = vi.hoisted(() => vi.fn());
const mockSetAuth      = vi.hoisted(() => vi.fn());

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
  useGoogleLogin: () => vi.fn(),
}));

vi.mock('../services/api', () => ({
  authApi: { register: mockRegister, googleLogin: vi.fn() },
}));

vi.mock('../store/authStore', () => ({
  useAuthStore: () => ({ setAuth: mockSetAuth }),
}));

// ── Component import ──────────────────────────────────────────────────────────

import Register from '../pages/auth/Register';

// ── Helper ────────────────────────────────────────────────────────────────────

async function fillForm(
  user: ReturnType<typeof userEvent.setup>,
  overrides: { name?: string; email?: string; password?: string; confirmPassword?: string } = {}
) {
  const {
    name            = 'Bob Smith',
    email           = 'bob@example.com',
    password        = 'password123',
    confirmPassword = password,
  } = overrides;

  await user.type(screen.getByPlaceholderText('Enter your full name'), name);
  await user.type(screen.getByPlaceholderText('Enter your email'), email);
  await user.type(screen.getByPlaceholderText('Enter your password'), password);
  await user.type(screen.getByPlaceholderText('Confirm your password'), confirmPassword);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Register page', () => {
  beforeEach(() => vi.clearAllMocks());

  // ── Render ────────────────────────────────────────────────────────────────

  it('renders all required input fields', () => {
    render(<Register />);
    expect(screen.getByPlaceholderText('Enter your full name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter your email')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Confirm your password')).toBeInTheDocument();
  });

  it('has a link back to the login page', () => {
    render(<Register />);
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login');
  });

  // ── Client-side validation ────────────────────────────────────────────────

  it('shows error when password is shorter than 6 characters', async () => {
    const user = userEvent.setup();
    render(<Register />);
    await fillForm(user, { password: 'abc', confirmPassword: 'abc' });
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith('Password must be at least 6 characters')
    );
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('shows error when passwords do not match', async () => {
    const user = userEvent.setup();
    render(<Register />);
    await fillForm(user, { password: 'password123', confirmPassword: 'different456' });
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith('Passwords do not match')
    );
    expect(mockRegister).not.toHaveBeenCalled();
  });

  // ── Successful registration ───────────────────────────────────────────────

  it('calls authApi.register with the correct payload', async () => {
    const user = userEvent.setup();
    mockRegister.mockResolvedValueOnce({
      data: {
        user: { id: 2, name: 'Bob Smith', email: 'bob@example.com' },
        access_token: 'tok456',
      },
    });

    render(<Register />);
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() =>
      expect(mockRegister).toHaveBeenCalledWith({
        name: 'Bob Smith',
        email: 'bob@example.com',
        phone: undefined,
        password: 'password123',
      })
    );
  });

  it('calls setAuth and navigates to /dashboard after successful registration', async () => {
    const user = userEvent.setup();
    const fakeUser = { id: 2, name: 'Bob Smith', email: 'bob@example.com' };
    mockRegister.mockResolvedValueOnce({
      data: { user: fakeUser, access_token: 'tok456' },
    });

    render(<Register />);
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(mockSetAuth).toHaveBeenCalledWith(fakeUser, 'tok456');
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('shows API error when registration fails', async () => {
    const user = userEvent.setup();
    mockRegister.mockRejectedValueOnce({
      response: { data: { detail: 'Email already registered' } },
    });

    render(<Register />);
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith('Email already registered')
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
