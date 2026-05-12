import axios from 'axios';

const api = axios.create({
  baseURL: '',
  timeout: 120000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const isAuthRoute = window.location.pathname === '/login' || window.location.pathname === '/register';
      if (!isAuthRoute) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

// Auth
export const authApi = {
  register: (data: { name: string; email: string; phone?: string; password: string }) =>
    api.post('/api/auth/register', data),
  login: (email: string, password: string) => {
    const params = new URLSearchParams();
    params.append('username', email);
    params.append('password', password);
    return api.post('/api/auth/login', params);
  },
  googleLogin: (accessToken: string) =>
    api.post('/api/auth/google', { access_token: accessToken }),
  me: () => api.get('/api/auth/me'),
};

// Materials
export const materialsApi = {
  upload: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/api/materials/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  list: () => api.get('/api/materials/'),
  get: (id: number) => api.get(`/api/materials/${id}`),
  summarize: (id: number) => api.post(`/api/materials/${id}/summarize`),
  delete: (id: number) => api.delete(`/api/materials/${id}`),
};

// Q&A
export const qaApi = {
  ask: (question: string, materialId?: number) =>
    api.post('/api/qa/ask', { question, material_id: materialId }),
  history: (limit = 20) => api.get(`/api/qa/history?limit=${limit}`),
  analyzePatterns: (materialId: number) =>
    api.post('/api/qa/analyze-patterns', { material_id: materialId }),
  getPatternAnalysis: (materialId: number) =>
    api.get(`/api/qa/pattern-analysis/${materialId}`),
};

// Quizzes
export const quizzesApi = {
  generate: (data: { material_id: number; title: string; quiz_type: string; count: number }) =>
    api.post('/api/quizzes/generate', data),
  list: () => api.get('/api/quizzes/'),
  get: (id: number) => api.get(`/api/quizzes/${id}`),
  submit: (quizId: number, answers: Record<string, string>, timeTaken: number) =>
    api.post('/api/quizzes/attempt', { quiz_id: quizId, answers, time_taken: timeTaken }),
};

// Mock tests
export const mockTestsApi = {
  create: (data: { title: string; material_ids: number[]; questions_count: number; time_limit: number }) =>
    api.post('/api/mock-tests/create', data),
  list: () => api.get('/api/mock-tests/'),
  get: (id: number) => api.get(`/api/mock-tests/${id}`),
  submit: (mockTestId: number, answers: Record<string, string>, timeTaken: number) =>
    api.post('/api/mock-tests/submit', { mock_test_id: mockTestId, answers, time_taken: timeTaken }),
};

// Analytics
export const analyticsApi = {
  dashboard: () => api.get('/api/analytics/dashboard'),
  readiness: () => api.get('/api/analytics/readiness'),
  progress: () => api.get('/api/analytics/progress'),
};

export default api;
