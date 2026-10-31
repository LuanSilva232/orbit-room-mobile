import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.luansilva.orbitroom',
  appName: 'Orbit Room Mobile',
  webDir: 'out',
  server: {
    // Força o Capacitor a tratar as páginas como um servidor local estável, liberando as rotas do Next.js
    androidScheme: 'http',
    cleartext: true
  },
  plugins: {
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId: '832582713946-qil68mecqnbhrfuln0pqghv4u9o98601.apps.googleusercontent.com',
      forceCodeForRefreshToken: true,
    },
  },
};

export default config;
