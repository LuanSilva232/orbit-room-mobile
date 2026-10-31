import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.luansilva.orbitroom',
  appName: 'OrbitRoom Mobile',
  webDir: 'out',
  plugins: {
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId: '832582713946-2qlriqh7h1dph50ev0t54i6sth23a3od.apps.googleusercontent.com',
      forceCodeForRefreshToken: true,
    },
  },
};

export default config;
