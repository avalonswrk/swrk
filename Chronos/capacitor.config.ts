import { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'com.chronos.survival3d', appName: 'CHRONOS', webDir: 'dist',
  server: { androidScheme: 'http', cleartext: true }
};
export default config;
