export interface CapacitorConfig {
  appId: string;
  appName: string;
  webDir: string;
  server?: {
    androidScheme?: string;
    url?: string;
    cleartext?: boolean;
  };
  plugins?: Record<string, any>;
}

const config: CapacitorConfig = {
  appId: 'com.chesspath.app',
  appName: 'ChessPath',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#090d16',
      androidSplashResourceName: 'splash',
    },
  },
};

export default config;
