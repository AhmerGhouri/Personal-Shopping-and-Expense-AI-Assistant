import { Platform } from 'react-native';

// Standalone phone-test APK: computer and phone must share the same Wi-Fi.
// This is only the default; the address can be changed in the app's server settings
// without rebuilding. Use a deployed HTTPS API URL before distributing a production build.
const phoneTestBackendUrl = 'http://192.168.1.9:8000';

export const config = {
  defaultApiUrl: __DEV__
    ? (Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://localhost:8000')
    : phoneTestBackendUrl,
  speechLanguage: 'en-US',
} as const;
