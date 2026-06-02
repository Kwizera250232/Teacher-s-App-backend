/** @type {import('expo/config').ExpoConfig} */
export default {
  expo: {
    name: 'UClass Parent',
    slug: 'studentumunsiapp',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    scheme: 'studentumunsi',
    extra: {
      eas: {
        projectId: '4bb1dc32-c0ec-4bcd-945b-0c51e40d058b',
      },
      apiUrl: process.env.EXPO_PUBLIC_API_URL || 'https://studentapi.umunsi.com/api',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.umunsi.studentumunsiapp',
      infoPlist: {
        UIBackgroundModes: ['remote-notification'],
      },
    },
    android: {
      package: 'com.umunsi.studentumunsiapp',
      adaptiveIcon: {
        backgroundColor: '#075e54',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
      },
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON,
    },
    plugins: [
      [
        'expo-notifications',
        {
          icon: './assets/icon.png',
          color: '#075e54',
          sounds: [],
          defaultChannel: 'default',
        },
      ],
    ],
  },
};
