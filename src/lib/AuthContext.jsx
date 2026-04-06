import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { isFirebaseConfigured, loadFirebaseAuth, signInWithGoogle, signOutFirebase } from '@/lib/firebaseAuth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    let unsubscribe = () => {};
    let active = true;

    if (!isFirebaseConfigured()) {
      setUser(null);
      setIsLoadingAuth(false);
      return () => {};
    }

    loadFirebaseAuth()
      .then(({ auth }) => {
        if (!active) return;
        unsubscribe = auth.onAuthStateChanged((firebaseUser) => {
          if (!firebaseUser) {
            setUser(null);
            setAuthError(null);
            setIsLoadingAuth(false);
            return;
          }

          setUser({
            id: firebaseUser.uid,
            email: firebaseUser.email,
            name: firebaseUser.displayName,
            picture: firebaseUser.photoURL,
            provider: 'firebase-google',
          });
          setAuthError(null);
          setIsLoadingAuth(false);
        });
      })
      .catch((error) => {
        if (!active) return;
        setUser(null);
        setAuthError(error?.message || 'Unable to start Google authentication.');
        setIsLoadingAuth(false);
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const handleGoogleSignIn = useCallback(async () => {
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (error) {
      const message = error?.message || 'Google sign-in failed.';
      setAuthError(message);
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    if (!isFirebaseConfigured()) {
      setUser(null);
      setAuthError(null);
      return;
    }

    await signOutFirebase();
    setUser(null);
    setAuthError(null);
  }, []);

  const value = useMemo(() => ({
    user,
    isAuthenticated: Boolean(user),
    isGuestMode: !user,
    googleConfigured: isFirebaseConfigured(),
    isLoadingAuth,
    isLoadingPublicSettings: false,
    authError,
    appPublicSettings: null,
    logout,
    signInWithGoogle: handleGoogleSignIn,
    navigateToLogin: handleGoogleSignIn,
    checkAppState: async () => {},
  }), [authError, handleGoogleSignIn, isLoadingAuth, logout, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
