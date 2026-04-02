const FIREBASE_APP_SCRIPT = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js';
const FIREBASE_AUTH_SCRIPT = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js';
const FIREBASE_FIRESTORE_SCRIPT = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js';

let firebaseReadyPromise;

function getFirebaseConfig() {
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };
}

export function isFirebaseConfigured() {
  const config = getFirebaseConfig();
  return Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

export async function loadFirebaseAuth() {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase environment variables are missing.');
  }

  if (!firebaseReadyPromise) {
    firebaseReadyPromise = (async () => {
      await loadScript(FIREBASE_APP_SCRIPT);
      await loadScript(FIREBASE_AUTH_SCRIPT);
      await loadScript(FIREBASE_FIRESTORE_SCRIPT);

      const firebase = window.firebase;
      if (!firebase) {
        throw new Error('Firebase SDK did not load.');
      }

      if (!firebase.apps.length) {
        firebase.initializeApp(getFirebaseConfig());
      }

      return { firebase, auth: firebase.auth(), db: firebase.firestore() };
    })();
  }

  return firebaseReadyPromise;
}

export async function loadFirebaseDataLayer() {
  const { firebase, auth, db } = await loadFirebaseAuth();
  return { firebase, auth, db };
}

export async function signInWithGooglePopup() {
  const { firebase, auth } = await loadFirebaseAuth();
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return auth.signInWithPopup(provider);
}
