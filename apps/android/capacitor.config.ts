import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'br.com.hudplay.app',
  appName: 'Hudplay',
  webDir: '../../apps/web/dist',
  server: {
    androidScheme: 'https',
    cleartext: false,
  },
  plugins: {
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#16a34a',
    },
    PushNotifications: {
      presentationOptions: ['alert', 'badge', 'sound'],
    },
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;