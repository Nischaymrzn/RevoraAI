import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, GraduationCap } from 'lucide-react';
import { toast } from 'sonner';
import { useGoogleLogin } from '@react-oauth/google';
import { authApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [gLoading, setGLoading] = useState(false);
  const [errors, setErrors] = useState<{
    name?: string; email?: string; phone?: string;
    password?: string; confirmPassword?: string; general?: string;
  }>({});
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const newErrors: typeof errors = {};

    if (password.length < 6) newErrors.password = 'Password must be at least 6 characters';
    if (password !== confirmPw) newErrors.confirmPassword = 'Passwords do not match';

    if (Object.keys(newErrors).length) {
      setErrors(newErrors);
      Object.values(newErrors).forEach(msg => toast.error(msg!));
      return;
    }

    setErrors({});
    setLoading(true);
    try {
      const res = await authApi.register({ name, email, phone: phone || undefined, password });
      setAuth(res.data.user, res.data.access_token);
      toast.success('Account created! Welcome to Revora.');
      navigate('/dashboard');
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Registration failed. Please try again.';
      setErrors({ general: msg });
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setGLoading(true);
      try {
        const res = await authApi.googleLogin(tokenResponse.access_token);
        setAuth(res.data.user, res.data.access_token);
        toast.success('Account created! Welcome to Revora.');
        navigate('/dashboard');
      } catch {
        toast.error('Google sign-up failed. Please try again.');
      } finally {
        setGLoading(false);
      }
    },
    onError: () => toast.error('Google sign-up failed. Please try again.'),
  });

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-12 bg-white" style={{ fontSize: '16px' }}>

      {/* ── LEFT: Form ── */}
      <div className="flex flex-col px-10 py-6 lg:px-16 col-span-6 overflow-y-auto">
        <div className="w-full h-full flex flex-col" style={{ gap: 34 }}>

          {/* Logo */}
          <div className="inline-flex items-center gap-3">
            <div className="flex items-center justify-center rounded-xl bg-[#0f0f17]" style={{ width: 48, height: 48 }}>
              <GraduationCap size={21} className="text-white" strokeWidth={1.8} />
            </div>
            <span className="font-bold text-gray-900" style={{ fontSize: 21 }}>
              revora<span className="text-[#6DEB74]">.ai</span>
            </span>
          </div>

          {/* Form — centered */}
          <div className="flex flex-col items-center justify-center w-full flex-1 pb-8">
            <form onSubmit={handleSubmit} className="w-full max-w-[575px]" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Heading */}
              <div style={{ marginBottom: 8 }}>
                <h1 className="font-bold text-gray-900 text-center" style={{ fontSize: 32 }}>Let's get started</h1>
                <p className="text-gray-500 text-center" style={{ fontSize: 16, marginTop: 4 }}>Enter your details to create an account</p>
              </div>

              {/* General error */}
              {errors.general && (
                <p className="text-red-600" style={{ fontSize: 12.5 }}>{errors.general}</p>
              )}

              {/* Full Name */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label className="font-medium text-gray-900" style={{ fontSize: 14.5 }}>Full Name</label>
                <input
                  type="text"
                  placeholder="Enter your full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoFocus
                  autoComplete="name"
                  style={{ height: 44, fontSize: 14.5 }}
                  className="w-full px-4 rounded-lg border border-gray-200 bg-white font-medium text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-[#6DEB74]/40 focus:border-[#6DEB74] transition"
                />
                {errors.name && <p className="text-red-600" style={{ fontSize: 12.5 }}>{errors.name}</p>}
              </div>

              {/* Email */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label className="font-medium text-gray-900" style={{ fontSize: 14.5 }}>Email</label>
                <input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  style={{ height: 44, fontSize: 14.5 }}
                  className="w-full px-4 rounded-lg border border-gray-200 bg-white font-medium text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-[#6DEB74]/40 focus:border-[#6DEB74] transition"
                />
                {errors.email && <p className="text-red-600" style={{ fontSize: 12.5 }}>{errors.email}</p>}
              </div>

              {/* Phone */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label className="font-medium text-gray-900" style={{ fontSize: 14.5 }}>
                  Phone Number
                </label>
                <input
                  type="tel"
                  placeholder="Enter your phone number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                  style={{ height: 44, fontSize: 14.5 }}
                  className="w-full px-4 rounded-lg border border-gray-200 bg-white font-medium text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-[#6DEB74]/40 focus:border-[#6DEB74] transition"
                />
                {errors.phone && <p className="text-red-600" style={{ fontSize: 12.5 }}>{errors.phone}</p>}
              </div>

              {/* Password */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label className="font-medium text-gray-900" style={{ fontSize: 14.5 }}>Password</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    style={{ height: 44, fontSize: 14.5 }}
                    className="w-full pl-4 pr-12 rounded-lg border border-gray-200 bg-white font-medium text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-[#6DEB74]/40 focus:border-[#6DEB74] transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors"
                  >
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {errors.password && <p className="text-red-600" style={{ fontSize: 12.5 }}>{errors.password}</p>}
              </div>

              {/* Confirm Password */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label className="font-medium text-gray-900" style={{ fontSize: 14.5 }}>Confirm Password</label>
                <input
                  type="password"
                  placeholder="Confirm your password"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  required
                  autoComplete="new-password"
                  style={{ height: 44, fontSize: 14.5 }}
                  className="w-full px-4 rounded-lg border border-gray-200 bg-white font-medium text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-[#6DEB74]/40 focus:border-[#6DEB74] transition"
                />
                {errors.confirmPassword && (
                  <p className="text-red-600" style={{ fontSize: 12.5 }}>{errors.confirmPassword}</p>
                )}
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading || gLoading}
                style={{ height: 46, fontSize: 15.5, marginTop: 4 }}
                className="w-full rounded-lg bg-[#6DEB74] hover:bg-[#52e05a] text-gray-900 font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading
                  ? <><Loader2 size={16} className="animate-spin" />Creating account…</>
                  : 'Create account'}
              </button>

              <p className="text-center font-medium text-gray-500" style={{ fontSize: 14.5 }}>
                Already have an account?{' '}
                <Link to="/login" className="font-semibold text-gray-900 hover:underline">Sign in</Link>
              </p>

              {/* Divider */}
              <div className="flex items-center" style={{ gap: 10, margin: '2px 0' }}>
                <div className="flex-1 border-t border-gray-200" />
                <span className="text-gray-400" style={{ fontSize: 13 }}>Or continue with</span>
                <div className="flex-1 border-t border-gray-200" />
              </div>

              {/* Google button */}
              <button
                type="button"
                onClick={() => googleLogin()}
                disabled={loading || gLoading}
                style={{ height: 44, fontSize: 14.5 }}
                className="w-full rounded-lg border border-gray-200 bg-white text-gray-700 font-semibold hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {gLoading
                  ? <><Loader2 size={16} className="animate-spin text-gray-500" />Connecting…</>
                  : <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                    </svg>
                    Sign in with Google
                  </>}
              </button>

            </form>
          </div>
        </div>
      </div>

      {/* ── RIGHT: Brand panel ── */}
      <div
        className="hidden relative lg:flex col-span-6 rounded-2xl overflow-hidden"
        style={{
          margin: '16px 16px 16px 0',
          background: 'linear-gradient(135deg, #0f0f17 0%, #1a1a2e 100%)',
        }}
      >
        {/* Vector background */}
        <div
          className="absolute inset-0 z-0"
          style={{
            backgroundImage: 'url(/vector.png)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            opacity: 0.22,
          }}
        />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-start" style={{ marginTop: 125, marginLeft: 52, marginRight: 46 }}>
          <p className="text-gray-100 font-semibold leading-tight" style={{ fontSize: 34 }}>
            Start your AI powered revision journey and ace every exam
          </p>
          <p className="text-white/50" style={{ marginTop: 12 }}>
            Join students who use Revora to study smarter — upload notes, practice quizzes and assessments, get instant AI answers, and ace your exams with confidence.
          </p>

          <div className="relative w-full" style={{ marginTop: 32 }}>
            <img
              src="/system_1.png"
              alt="Revora dashboard"
              className="relative z-10 w-full h-auto object-contain rounded-2xl"
            />
          </div>
        </div>
      </div>

    </div>
  );
}
