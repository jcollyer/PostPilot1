import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';
import * as SecureStore from 'expo-secure-store';

import { API_URL, APP_SCHEME } from './config';

/**
 * Better Auth client for the mobile app.
 *
 * The Expo plugin:
 *   - persists the session cookie in SecureStore (key prefix `postpilot`),
 *   - attaches it to this client's own requests, and
 *   - exposes `authClient.getCookie()` so we can forward the same cookie on
 *     our tRPC requests (see TRPCProvider).
 *
 * `scheme` must match the app's custom URL scheme in app.json so OAuth /
 * deep-link redirects resolve back into the app.
 */
export const authClient = createAuthClient({
  baseURL: API_URL,
  plugins: [
    expoClient({
      scheme: APP_SCHEME,
      storagePrefix: 'postpilot',
      storage: SecureStore,
    }),
  ],
});

export const { signIn, signUp, signOut, useSession } = authClient;
