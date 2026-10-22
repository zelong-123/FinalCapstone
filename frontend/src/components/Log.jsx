import React, { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  FaArrowRight,
  FaChartLine,
  FaCircleExclamation,
  FaEye,
  FaEyeSlash,
  FaGlobe,
  FaMoon,
  FaShieldHalved,
  FaSun,
} from 'react-icons/fa6';
import FranchiseImg from '../assets/Logo.jpg.png';
import AppIconImg from '../assets/icon.png.png';
import { api, firstValidationMessage } from '../lib/api';
import { ROLE_HOME, roleName, useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { AppLoader } from './ApiUi';
import './Log.css';

const highlights = [
  [FaGlobe, 'Multi-role operations', 'One secure workspace across the franchise lifecycle.'],
  [FaChartLine, 'Live intelligence', 'Connected performance, inventory, and pipeline visibility.'],
  [FaShieldHalved, 'Role-based security', 'Protected access aligned with operational responsibility.'],
];

export default function Log() {
  const { login, isAuthenticated, role, loading } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [keepSignedIn, setKeepSignedIn] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [loggedUser, setLoggedUser] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [serverStatus, setServerStatus] = useState('checking');

  useEffect(() => {
    let active = true;
    api.get('/health', undefined, { skipAuth: true, timeout: 8000 })
      .then(() => { if (active) setServerStatus('online'); })
      .catch(() => { if (active) setServerStatus('offline'); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (showSuccess && loggedUser) {
      const timer = window.setTimeout(() => {
        const requested = location.state?.from?.pathname;
        navigate(requested || ROLE_HOME[roleName(loggedUser)] || '/', { replace: true });
      }, 1050);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [showSuccess, loggedUser, location.state, navigate]);

  if (loading) return <AppLoader label="Restoring your secure session…" />;
  if (isAuthenticated && !showSuccess) return <Navigate to={ROLE_HOME[role] || '/'} replace />;

  const handleLogin = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const user = await login(email.trim(), password, keepSignedIn);
      setLoggedUser(user);
      setShowSuccess(true);
    } catch (requestError) {
      setError(firstValidationMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-wrapper">
      <div className="login-ambient login-ambient-one" />
      <div className="login-ambient login-ambient-two" />

      <header className="login-topbar">
        <div className="login-mini-brand"><img src={AppIconImg} alt="" /><span>FRANCHISE TITAN</span></div>
        <div className="login-top-actions">
          <span className={`login-server-status status-${serverStatus}`}>
            <span />{serverStatus === 'online' ? 'Systems operational' : serverStatus === 'offline' ? 'Server unavailable' : 'Checking connection'}
          </span>
          <button type="button" className="login-theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
            {theme === 'dark' ? <FaSun /> : <FaMoon />}
          </button>
        </div>
      </header>

      <section className="login-container" aria-label="Herald sign in">
        <div className="login-left">
          <div className="login-copy">
            <span className="login-eyebrow"><span /> Enterprise operations platform</span>
            <h1>Welcome back.</h1>
            <p>Sign in to your secure Herald workspace and continue managing the franchise network.</p>
          </div>

          {error && <div className="login-error" role="alert"><FaCircleExclamation /><span>{error}</span></div>}

          <form onSubmit={handleLogin} className="login-form">
            <label htmlFor="email">Work email</label>
            <input
              id="email"
              type="email"
              placeholder="name@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              spellCheck="false"
              required
            />

            <div className="password-label-row"><label htmlFor="password">Password</label><span>Secure access</span></div>
            <div className="password-box">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
              <button type="button" className="eye" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>

            <label className="remember-row">
              <input type="checkbox" checked={keepSignedIn} onChange={(event) => setKeepSignedIn(event.target.checked)} />
              <span>Keep me signed in on this trusted device</span>
            </label>

            <button type="submit" className="login-btn" disabled={submitting}>
              <span>{submitting ? 'Authenticating…' : 'Sign in to Herald'}</span>
              {submitting ? <span className="button-spinner" /> : <FaArrowRight />}
            </button>
          </form>

          {import.meta.env.DEV && <p className="development-hint">Development seed: admin@franchisetitan.local / Password123!</p>}
          <p className="login-legal">Authorized users only. Activity may be logged for security and audit purposes.</p>
        </div>

        <div className="login-right" style={{ backgroundImage: `url(${FranchiseImg})` }}>
          <div className="login-visual-overlay" />
          <div className="login-visual-content">
            <span className="visual-kicker">Built for scale</span>
            <h2>Turn every franchise decision into a connected operation.</h2>
            <p>From first inquiry to ongoing supply fulfillment, Herald keeps teams aligned with a single operational source of truth.</p>
            <div className="login-highlights">
              {highlights.map(([Icon, title, copy]) => (
                <div className="login-highlight" key={title}>
                  <span><Icon /></span>
                  <div><strong>{title}</strong><small>{copy}</small></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <footer className="login-footer"><span>© {new Date().getFullYear()} Herald Operations</span><span>Secure · Connected · Auditable</span></footer>

      {showSuccess && (
        <div className="success-overlay-blur">
          <div className="ios-glass-card">
            <div className="ios-icon-circle"><img src={AppIconImg} alt="Herald" className="counter-clockwise-spin" /></div>
            <span className="success-kicker">Authentication verified</span>
            <h3 className="ios-status-title">Login successful</h3>
            <p className="ios-welcome-msg">Welcome, <span className="highlight-position">{roleName(loggedUser)}</span> <strong className="highlight-name">{loggedUser?.full_name}</strong></p>
            <div className="ios-redirect-box"><span className="ios-pulse-dot" /><p className="ios-redirect-text">Preparing your connected workspace</p></div>
            <div className="success-progress"><span /></div>
          </div>
        </div>
      )}
    </main>
  );
}
