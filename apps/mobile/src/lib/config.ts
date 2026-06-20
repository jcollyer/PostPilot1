import Constants from 'expo-constants';

/**
 * Backend API URL. In dev this must be your machine's LAN IP (not localhost,
 * because localhost on the phone points to the phone itself). Set it via:
 *   EXPO_PUBLIC_API_URL=http://192.168.1.42:3000 npx expo start
 *
 * In production this is your hosted origin, e.g. https://your-domain.com.
 */
const fallbackDevUrl = () => {
  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  if (!hostUri) return 'http://localhost:3000';
  const host = hostUri.split(':')[0];
  return `http://${host}:3000`;
};

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? fallbackDevUrl();

/** Custom URL scheme registered in app.json. Used for OAuth redirects. */
export const APP_SCHEME = 'postpilot';
