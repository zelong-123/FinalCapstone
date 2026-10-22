import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, authToken } from '../lib/api';

const AuthContext = createContext(null);

export const ROLE_HOME = {
  admin: '/admin-dashboard',
  marketing: '/marketing-dashboard',
  sales: '/sales-dashboard',
  logistics: '/logistics-dashboard',
  franchisee: '/franchisee-dashboard',
};

export function roleName(user) {
  return user?.role?.name || user?.role || '';
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const clearSession = useCallback(() => {
    authToken.clear();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!authToken.get()) {
      setLoading(false);
      return null;
    }
    try {
      const response = await api.get('/auth/me');
      setUser(response.data);
      return response.data;
    } catch {
      clearSession();
      return null;
    } finally {
      setLoading(false);
    }
  }, [clearSession]);

  useEffect(() => {
    refreshUser();
    const handleUnauthorized = () => clearSession();
    window.addEventListener('herald:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('herald:unauthorized', handleUnauthorized);
  }, [clearSession, refreshUser]);

  const login = useCallback(async (email, password, keepSignedIn = false) => {
    const response = await api.post('/auth/login', {
      email,
      password,
      device_name: keepSignedIn ? 'herald-browser-persistent' : 'herald-browser-session',
    }, { skipAuth: true });
    authToken.set(response.data.token, keepSignedIn);
    setUser(response.data.user);
    return response.data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      if (authToken.get()) await api.post('/auth/logout');
    } catch {
      // The local session must still be cleared if the server is unreachable.
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo(() => ({
    user,
    role: roleName(user),
    loading,
    login,
    logout,
    refreshUser,
    isAuthenticated: Boolean(user),
  }), [user, loading, login, logout, refreshUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
