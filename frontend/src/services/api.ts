import axios, { AxiosResponse, AxiosError } from 'axios';

const AUTH_TOKEN_KEY = 'scoutd3.authToken';
const ANON_SESSION_KEY = 'scoutd3.anonSession';

// Stable per-tab identifier so anonymous reports stay scoped to the
// browser session that generated them. Uses sessionStorage so that a
// fresh visit (new tab/window) starts with a clean identity and does
// not inherit reports generated in a previous session.
const getAnonSessionId = (): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  let id = sessionStorage.getItem(ANON_SESSION_KEY);
  if (!id) {
    const cryptoObj = (window as any).crypto;
    if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
      id = cryptoObj.randomUUID();
    } else {
      id = `anon-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }
    sessionStorage.setItem(ANON_SESSION_KEY, id);
  }
  return id;
};

const rotateAnonSessionId = (): void => {
  if (typeof window === 'undefined') {
    return;
  }
  sessionStorage.removeItem(ANON_SESSION_KEY);
};

// API Configuration (Vite environment variables)
const resolveApiBaseUrl = (): string => {
  const configuredApiUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (configuredApiUrl) {
    return configuredApiUrl;
  }

  if (typeof window === 'undefined') {
    return 'http://localhost:8000/api/v1';
  }

  const { protocol, hostname } = window.location;

  // In local dev, keep frontend/backend hostnames aligned to avoid CORS mismatches.
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${protocol}//${hostname}:8000/api/v1`;
  }

  // In production, default to same-origin API routing.
  return `${window.location.origin}/api/v1`;
};

const API_BASE_URL = resolveApiBaseUrl();

// Create axios instance with default configuration
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // 30 seconds timeout
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for adding authentication tokens (if needed in the future)
apiClient.interceptors.request.use(
  (config) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem(AUTH_TOKEN_KEY) : null;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    const anonSession = getAnonSessionId();
    if (anonSession) {
      config.headers['X-Anon-Session'] = anonSession;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for handling errors
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(AUTH_TOKEN_KEY);
      }
      console.warn('Unauthorized access detected');
    }
    
    if (error.response?.status >= 500) {
      // Handle server errors
      console.error('Server error:', error.response?.data);
    }
    
    return Promise.reject(error);
  }
);

// API Service object with all endpoints
export const api = {
  // Generic HTTP methods
  get: (url: string, config = {}) => apiClient.get(url, config),
  post: (url: string, data = {}, config = {}) => apiClient.post(url, data, config),
  put: (url: string, data = {}, config = {}) => apiClient.put(url, data, config),
  delete: (url: string, config = {}) => apiClient.delete(url, config),

  auth: {
    register: (data: { username: string; password: string }) => apiClient.post('/auth/register', data),
    login: (data: { username: string; password: string }) => apiClient.post('/auth/login', data),
    logout: () => apiClient.post('/auth/logout'),
    me: () => apiClient.get('/auth/me'),
    getActivity: (limit = 50) => apiClient.get(`/users/me/activity?limit=${limit}`),
  },
  
  // Teams endpoints
  teams: {
    getAll: (params = {}) => apiClient.get('/teams/', { params }),
    getById: (id: string) => apiClient.get(`/teams/${id}`),
    create: (teamData: any) => apiClient.post('/teams/', teamData),
    update: (id: string, teamData: any) => apiClient.put(`/teams/${id}`, teamData),
    delete: (id: string) => apiClient.delete(`/teams/${id}`),
    getStatistics: (id: string) => apiClient.get(`/teams/${id}/statistics`),
    getStatisticsPdf: (id: string) => apiClient.get(`/teams/${id}/statistics/pdf`, { responseType: 'blob' }),
    getGames: (id: string) => apiClient.get(`/teams/${id}/games`),
    getOpponents: (id: string) => apiClient.get(`/teams/${id}/opponents`),
  },
  
  // Games endpoints
  games: {
    getAll: (params = {}) => apiClient.get('/games/', { params }),
    getById: (id: string) => apiClient.get(`/games/${id}`),
    create: (gameData: any) => apiClient.post('/games/', gameData),
    update: (id: string, gameData: any) => apiClient.put(`/games/${id}`, gameData),
    delete: (id: string) => apiClient.delete(`/games/${id}`),
    getStatistics: (id: string) => apiClient.get(`/games/${id}/statistics`),
    getMatchup: (team1Id: string, team2Id: string) => apiClient.get(`/games/matchup/${team1Id}/${team2Id}`),
    getUpcoming: (teamId: string) => apiClient.get(`/games/upcoming/${teamId}`),
    getRecent: (teamId: string) => apiClient.get(`/games/recent/${teamId}`),
  },
  
  // Analytics endpoints
  analytics: {
    getTeamIdentity: (teamId: string) => apiClient.get(`/analytics/team/${teamId}/identity`),
    getMatchupAnalysis: (params: any) => apiClient.get('/analytics/matchup', { params }),
    getTeamTrends: (teamId: string) => apiClient.get(`/analytics/team/${teamId}/trends`),
    calculateSeasonStats: (data: any) => apiClient.post('/analytics/season/calculate', data),
    getTeamComparison: (teamId: string, params = {}) => apiClient.get(`/analytics/team/${teamId}/comparison`, { params }),
    getComparisonPdf: (teamId: string, vsTeamId: string) =>
      apiClient.get(`/analytics/team/${teamId}/comparison/pdf`, {
        params: { vs_team: vsTeamId },
        responseType: 'blob',
        timeout: 120000,
        headers: { Accept: 'application/pdf' },
      }),
    getSportRankings: (sport: string) => apiClient.get(`/analytics/sport/${sport}/rankings`),
    getPlayerAnalytics: (playerId: string) => apiClient.get(`/analytics/player/${playerId}`),
    getPrediction: (homeTeamId: string, awayTeamId: string) => apiClient.get(`/analytics/predict/${homeTeamId}/${awayTeamId}`),
  },
  
  // Reports endpoints
  reports: {
    generate: (reportData: any) => apiClient.post('/reports/generate', reportData),
    getAll: (params = {}) => apiClient.get('/reports/', { params }),
    getById: (id: string) => apiClient.get(`/reports/${id}`),
    getHtml: (id: string) => apiClient.get(`/reports/${id}/html`),
    getPdf: (id: string) => apiClient.get(`/reports/${id}/pdf`, { responseType: 'blob' }),
    create: (reportData: any) => apiClient.post('/reports/', reportData),
    regenerate: (id: string) => apiClient.put(`/reports/${id}/regenerate`),
    getTemplates: () => apiClient.get('/reports/templates/'),
    getInsights: (id: string) => apiClient.get(`/reports/${id}/insights`),
    delete: (id: string) => apiClient.delete(`/reports/${id}`),
    getLatestForTeam: (teamId: string) => apiClient.get(`/reports/team/${teamId}/latest`),
    clearMine: () => apiClient.delete('/reports/'),
  },
  
  // Data Ingestion endpoints
  ingestion: {
    createJob: (jobData: any) => apiClient.post('/ingestion/jobs', jobData),
    getJobs: () => apiClient.get('/ingestion/jobs'),
    getJob: (id: string) => apiClient.get(`/ingestion/jobs/${id}`),
    deleteJob: (id: string) => apiClient.delete(`/ingestion/jobs/${id}`),
    discoverTeams: (data: any) => apiClient.post('/ingestion/teams/discover', data),
    importGames: (params: any) => apiClient.post('/ingestion/games/import', {}, { params }),
    importStatistics: (params: any) => apiClient.post('/ingestion/statistics/import', {}, { params }),
    validateSource: (params: any) => apiClient.post('/ingestion/validate-source', {}, { params }),
    refreshAll: (params: any) => apiClient.post('/ingestion/refresh-all', {}, { params }),
    getHealth: () => apiClient.get('/ingestion/health'),
    
    // Comprehensive ingestion endpoints
    comprehensive: {
      startFull: () => apiClient.post('/ingestion/comprehensive/full'),
      startSample: (numColleges = 10) => apiClient.post(`/ingestion/comprehensive/sample?num_colleges=${numColleges}`),
      getStatus: (jobId: string) => apiClient.get(`/ingestion/comprehensive/status/${jobId}`),
      getDiscoveryPreview: () => apiClient.get('/ingestion/comprehensive/discovery/preview'),
      getSummary: () => apiClient.get('/ingestion/comprehensive/summary'),
      parseSamplePdf: (params: any) => apiClient.post('/ingestion/pdf/parse-sample', {}, { params }),
    },
  },
  
  // Health check endpoint
  health: () => apiClient.get('/health'),

  system: {
    getStats: () => apiClient.get('/stats'),
    getScrapeStatus: () => apiClient.get('/scrape/status'),
  },
  
  // Application health endpoint  
  appHealth: () => apiClient.get('/'),
};

// Export the configured axios instance as well for direct use if needed
export { apiClient };
export { rotateAnonSessionId };
export const authTokenStorage = {
  get: () => (typeof window !== 'undefined' ? localStorage.getItem(AUTH_TOKEN_KEY) : null),
  set: (token: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    }
  },
  clear: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  },
};

// Error handling helper
export const handleApiError = (error: AxiosError) => {
  if (error.response) {
    // Server responded with error status
    return {
      status: error.response.status,
      message: error.response.data || 'Server error occurred',
      data: error.response.data,
    };
  } else if (error.request) {
    // Request made but no response received
    return {
      status: 0,
      message: 'Network error - unable to reach server',
      data: null,
    };
  } else {
    // Something else happened
    return {
      status: -1,
      message: error.message || 'Unknown error occurred',
      data: null,
    };
  }
};

// Success response helper
export const handleApiSuccess = (response: AxiosResponse) => {
  return {
    status: response.status,
    data: response.data,
    headers: response.headers,
  };
};

export default api;