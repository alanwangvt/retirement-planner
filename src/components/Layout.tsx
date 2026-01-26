import { ReactNode, useState, useEffect } from 'react';
import { CountrySelector } from './CountrySelector';
import { auth } from '../firebase';
import {
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  User,
} from 'firebase/auth';

interface LayoutProps {
  children: ReactNode;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onReset: () => void;
}

export function Layout({ children, isDarkMode, onToggleDarkMode, onReset }: LayoutProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSignupOpen, setIsSignupOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return unsubscribe;
  }, []);

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      await createUserWithEmailAndPassword(auth, email, password);
      setIsSignupOpen(false);
      setEmail('');
      setPassword('');
    } catch (err: unknown) {
      const fbError = err as { code?: string; message?: string };
      if (fbError.code === 'auth/email-already-in-use') {
        setError('Email already in use');
      } else if (fbError.code === 'auth/weak-password') {
        setError('Password is too weak (minimum 6 characters)');
      } else {
        setError(fbError.message || 'Sign up failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    try {
      setLoading(true);
      setError(null);
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      setIsSignupOpen(false);
      setEmail('');
      setPassword('');
    } catch (err: unknown) {
      const fbError = err as { message?: string };
      setError(fbError.message || 'Google sign-up failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err: unknown) {
      const fbError = err as { message?: string };
      console.error('Logout failed:', fbError.message);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Retirement Planner
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                Plan your financial future with tax-optimized projections
              </p>
              {/* Country Selector - Always visible below subtitle */}
              <div className="mt-2">
                <CountrySelector />
              </div>
            </div>

            {/* Desktop controls - hidden on mobile */}
            <div className="hidden md:flex items-center gap-4">
              {/* Legend */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                  <span>Pre-Tax</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <span className="w-3 h-3 rounded-full bg-green-500"></span>
                  <span>Roth</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <span className="w-3 h-3 rounded-full bg-amber-500"></span>
                  <span>Taxable</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <span className="w-3 h-3 rounded-full bg-purple-500"></span>
                  <span>HSA</span>
                </div>

                {/* Separator and Signup button to the right of HSA */}
                <div className="w-px h-6 bg-gray-300 dark:bg-gray-600"></div>
                {user ? (
                  <button
                    onClick={handleLogout}
                    className="px-3 py-1 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
                    title="Log out"
                    type="button"
                  >
                    Logout
                  </button>
                ) : (
                  <button
                    onClick={() => setIsSignupOpen(true)}
                    className="px-3 py-1 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                    title="Sign up or log in"
                    type="button"
                  >
                    Sign Up/Login
                  </button>
                )}
              </div>

              {/* Divider */}
              <div className="w-px h-6 bg-gray-300 dark:bg-gray-600"></div>

              {/* Reset Button */}
              <button
                onClick={onReset}
                className="p-2 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                title="Reset all data"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>

              {/* Dark Mode Toggle */}
              <button
                onClick={onToggleDarkMode}
                className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {isDarkMode ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </button>
            </div>

            {/* Mobile hamburger menu */}
            <div className="md:hidden relative">
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                title="Menu"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>

              {/* Dropdown menu */}
              {isMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-2 z-50">
                  <button
                    onClick={() => {
                      onReset();
                      setIsMenuOpen(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Reset all data
                  </button>
                  <button
                    onClick={() => {
                      onToggleDarkMode();
                      setIsMenuOpen(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3"
                  >
                    {isDarkMode ? (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                        Light mode
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                        </svg>
                        Dark mode
                      </>
                    )}
                  </button>

                      <div className="border-t border-gray-200 dark:border-gray-700 my-2"></div>
                      {user ? (
                        <button
                          onClick={() => {
                            handleLogout();
                            setIsMenuOpen(false);
                          }}
                          className="w-full px-4 py-2 text-left text-sm text-white bg-red-600 hover:bg-red-700 rounded-md"
                        >
                          Logout
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setIsSignupOpen(true);
                            setIsMenuOpen(false);
                          }}
                          className="w-full px-4 py-2 text-left text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-md"
                        >
                          Sign Up/Login
                        </button>
                      )}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Signup Modal */}
      {isSignupOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => setIsSignupOpen(false)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6 relative"
            onClick={e => e.stopPropagation()}
          >
            <button
              aria-label="Close signup modal"
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              onClick={() => setIsSignupOpen(false)}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Create Account or Sign In</h2>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              Save your plans securely and access them from any device.
            </p>

            {error && (
              <div className="mb-3 p-3 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 text-sm rounded-md">
                {error}
              </div>
            )}

            <form onSubmit={handleEmailSignup} className="space-y-3">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
              />
              <button
                className="w-full py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                type="submit"
                disabled={loading}
              >
                {loading ? 'Signing up...' : 'Sign Up/Login'}
              </button>
            </form>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-2 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">Or</span>
              </div>
            </div>

            <button
              onClick={handleGoogleSignup}
              disabled={loading}
              className="w-full py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              type="button"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Sign up/Login with Google
            </button>

            <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-4">
              By signing up you agree to our terms and privacy policy.
            </p>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <p className="text-sm text-gray-500 dark:text-gray-400 flex-1 text-center">
            This tool provides estimates only. Consult a financial advisor for personalized advice.
            Tax calculations use 2024 federal brackets.
          </p>
          <a
            href="https://github.com/alanwangvt/retirement-planner"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors ml-4"
            title="View on GitHub"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
            </svg>
          </a>
        </div>
      </footer>
    </div>
  );
}
