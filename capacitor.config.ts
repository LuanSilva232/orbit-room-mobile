import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.luansilva.orbitroom',
  appName: 'OrbitRoom Mobile',
  webDir: 'out',
  server: {
    // Permite que o Next.js gerencie as rotas estáticas (como /login) dentro do celular sem se perder
    androidScheme: 'http',
    cleartext: true
  },
  plugins: {
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId: '832582713946-2qlriqh7h1dph50ev0t54i6sth23a3od.apps.googleusercontent.com',
      forceCodeForRefreshToken: true,
    },
  },
};

export default config;
