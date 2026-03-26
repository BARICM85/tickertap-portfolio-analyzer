import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { isFirebaseConfigured, loadFirebaseAuth, signInWithGooglePopup } from '@/lib/firebaseAuth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

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
          setIsLoadingAuth(false);
        });
      })
      .catch(() => {
        if (!active) return;
        setUser(null);
        setIsLoadingAuth(false);
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    await signInWithGooglePopup();
  }, []);

  const logout = useCallback(async () => {
    if (!isFirebaseConfigured()) {
      setUser(null);
      return;
    }

    const { auth } = await loadFirebaseAuth();
    await auth.signOut();
    setUser(null);
  }, []);

  const value = useMemo(() => ({
    user,
    isAuthenticated: Boolean(user),
    isGuestMode: !user,
    googleConfigured: isFirebaseConfigured(),
    isLoadingAuth,
    isLoadingPublicSettings: false,
    authError: null,
    appPublicSettings: null,
    logout,
    signInWithGoogle,
    navigateToLogin: signInWithGoogle,
    checkAppState: async () => {},
  }), [isLoadingAuth, logout, signInWithGoogle, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
