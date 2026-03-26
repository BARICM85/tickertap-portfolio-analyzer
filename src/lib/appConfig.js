const isBrowser = typeof window !== 'undefined';

function sanitizeToken(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'default';
}

export function getRuntimeMode() {
  const configured = sanitizeToken(import.meta.env.VITE_RUNTIME_MODE || '');
  if (configured !== 'default') return configured;
  if (!isBrowser) return 'local';

  const host = window.location.hostname;
  if (host === '127.0.0.1' || host === 'localhost') return 'local';
  return 'web';
}

export function getStorageNamespace() {
  const configured = sanitizeToken(import.meta.env.VITE_STORAGE_NAMESPACE || '');
  if (configured !== 'default') return configured;
  return getRuntimeMode();
}

export function namespacedKey(baseKey) {
  return `${baseKey}_${getStorageNamespace()}`;
}
