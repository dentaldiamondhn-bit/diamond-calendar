import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.diamondcalendar.app',
  appName: 'Diamond Calendar',
  webDir: 'out',
  server: {
    url: 'https://calendario.dentaldiamondhn.com',
    androidScheme: 'https',
    cleartext: true,
    allowNavigation: ['*'],
  },
};

export default config;