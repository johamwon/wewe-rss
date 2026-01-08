export const isProd = import.meta.env.PROD;

export const serverOriginUrl =
  import.meta.env.VITE_SERVER_ORIGIN_URL ||
  (isProd ? window.__WEWE_RSS_SERVER_ORIGIN_URL__ : undefined) ||
  window.location.origin;

export const appVersion = __APP_VERSION__;

const enabledAuthCodeEnv = import.meta.env.VITE_ENABLED_AUTH_CODE;
export const enabledAuthCode =
  enabledAuthCodeEnv !== undefined
    ? enabledAuthCodeEnv === 'true'
    : window.__WEWE_RSS_ENABLED_AUTH_CODE__ ?? false;
