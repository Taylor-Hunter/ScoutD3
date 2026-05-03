import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { api, authTokenStorage, rotateAnonSessionId } from '../services/api';

type AuthUser = {
  id: number;
  username: string;
  created_at: string | null;
  last_login_at: string | null;
  is_active: boolean;
};

type AuthContextValue = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const extractErrorMessage = (error: any) => {
  return error?.response?.data?.detail || error?.message || 'Authentication request failed';
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = async () => {
    const token = authTokenStorage.get();
    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const response = await api.auth.me();
      setUser(response.data.user);
    } catch {
      authTokenStorage.clear();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refreshUser();
  }, []);

  const handleAuthSuccess = (payload: any) => {
    authTokenStorage.set(payload.access_token);
    setUser(payload.user);
    // Note: we do NOT clear reports on login. The owner-filter on the
    // reports endpoints already hides anonymous (pre-login) reports
    // from authenticated users, while still letting them see every
    // report they have generated under this account.
  };

  const login = async (username: string, password: string) => {
    try {
      const response = await api.auth.login({ username, password });
      handleAuthSuccess(response.data);
    } catch (error) {
      throw new Error(extractErrorMessage(error));
    }
  };

  const register = async (username: string, password: string) => {
    try {
      const response = await api.auth.register({ username, password });
      handleAuthSuccess(response.data);
    } catch (error) {
      throw new Error(extractErrorMessage(error));
    }
  };

  const logout = async () => {
    try {
      if (authTokenStorage.get()) {
        await api.auth.logout();
      }
    } catch {
      // Clear local session even if backend logout is unavailable.
    } finally {
      authTokenStorage.clear();
      // Drop the per-tab anonymous identity too so the next visit
      // starts with a fresh, empty Reports list.
      rotateAnonSessionId();
      setUser(null);
    }
  };

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: !!user,
      isLoading,
      login,
      register,
      logout,
      refreshUser,
    }),
    [user, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};