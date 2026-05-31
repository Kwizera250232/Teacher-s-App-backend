import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);
const IMPERSONATING_KEY = 'impersonating';
const ADMIN_BACKUP_TOKEN_KEY = 'admin_backup_token';
const ADMIN_BACKUP_USER_KEY = 'admin_backup_user';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
    }
    setIsImpersonating(localStorage.getItem(IMPERSONATING_KEY) === '1');
    setLoading(false);
  }, []);

  const login = (token, user) => {
    localStorage.removeItem(IMPERSONATING_KEY);
    localStorage.removeItem(ADMIN_BACKUP_TOKEN_KEY);
    localStorage.removeItem(ADMIN_BACKUP_USER_KEY);
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    setToken(token);
    setUser(user);
    setIsImpersonating(false);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem(IMPERSONATING_KEY);
    localStorage.removeItem(ADMIN_BACKUP_TOKEN_KEY);
    localStorage.removeItem(ADMIN_BACKUP_USER_KEY);
    setToken(null);
    setUser(null);
    setIsImpersonating(false);
  };

  const updateUser = (nextUser) => {
    if (!nextUser) return;
    localStorage.setItem('user', JSON.stringify(nextUser));
    setUser(nextUser);
  };

  const startImpersonation = (nextToken, nextUser) => {
    if (!nextToken || !nextUser) return;
    if (!isImpersonating && user?.role === 'admin' && token) {
      localStorage.setItem(ADMIN_BACKUP_TOKEN_KEY, token);
      localStorage.setItem(ADMIN_BACKUP_USER_KEY, JSON.stringify(user));
    }
    localStorage.setItem(IMPERSONATING_KEY, '1');
    localStorage.setItem('token', nextToken);
    localStorage.setItem('user', JSON.stringify(nextUser));
    setToken(nextToken);
    setUser(nextUser);
    setIsImpersonating(true);
  };

  const stopImpersonation = () => {
    const adminToken = localStorage.getItem(ADMIN_BACKUP_TOKEN_KEY);
    const adminUser = localStorage.getItem(ADMIN_BACKUP_USER_KEY);
    if (!adminToken || !adminUser) {
      logout();
      return;
    }
    localStorage.setItem('token', adminToken);
    localStorage.setItem('user', adminUser);
    localStorage.removeItem(IMPERSONATING_KEY);
    localStorage.removeItem(ADMIN_BACKUP_TOKEN_KEY);
    localStorage.removeItem(ADMIN_BACKUP_USER_KEY);
    setToken(adminToken);
    setUser(JSON.parse(adminUser));
    setIsImpersonating(false);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, updateUser, loading, isImpersonating, startImpersonation, stopImpersonation }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
