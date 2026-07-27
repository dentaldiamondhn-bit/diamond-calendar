import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.diamondcalendar.app',
  appName: 'Diamond Calendar',
  webDir: 'out',
  bundledWebRuntime: false,
  server: {
    url: 'https://calendario.dentaldiamondhn.com',
    androidScheme: 'https',
    cleartext: true,
    allowNavigation: ['*'],
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    LocalNotifications: {
      smallIcon: 'notification_icon',
      iconColor: '#14b8a6',
      sound: 'default',
    },
    AppLauncher: {
      enabled: true,
    },
  },
};

export default config;
