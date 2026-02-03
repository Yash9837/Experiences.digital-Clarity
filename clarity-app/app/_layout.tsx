import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import Colors from '@/constants/Colors';
import {
  initializeNotifications,
  addNotificationResponseListener,
} from '@/lib/notificationService';

export {
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(auth)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// Custom navigation themes with Clarity colors
const ClarityLightTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: Colors.primary[500],
    background: Colors.background.primary,
    card: '#FFFFFF',
    text: Colors.text.primary,
    border: Colors.neutral[200],
  },
};

const ClarityDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: Colors.primary[400],
    background: Colors.background.dark,
    card: Colors.neutral[800],
    text: Colors.text.inverse,
    border: Colors.neutral[700],
  },
};

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { session, loading, onboardingCompleted } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const notificationListener = useRef<ReturnType<typeof addNotificationResponseListener> | null>(null);

  // Initialize notifications when user is authenticated
  useEffect(() => {
    if (session && onboardingCompleted) {
      console.log('🔔 Initializing notifications...');
      initializeNotifications();
    }
  }, [session, onboardingCompleted]);

  // Handle notification taps
  useEffect(() => {
    notificationListener.current = addNotificationResponseListener((response) => {
      const data = response.notification.request.content.data;
      const type = data?.type as string;

      console.log('📬 Notification tapped:', type);

      // Navigate to the appropriate check-in
      if (type === 'morning' || type === 'midday' || type === 'evening') {
        router.push(`/check-in?type=${type}`);
      }
    });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
    };
  }, [router]);

  // Auth routing
  useEffect(() => {
    console.log('🧭 [Nav] Checking route...', { loading, session: !!session, onboardingCompleted, segments: segments[0] });

    if (loading) {
      console.log('🧭 [Nav] Still loading auth, waiting...');
      return;
    }

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboarding = segments[0] === 'onboarding';

    console.log('🧭 [Nav] Current location:', { inAuthGroup, inOnboarding });

    if (!session) {
      // No session, redirect to auth
      console.log('🧭 [Nav] No session, redirecting to login');
      if (!inAuthGroup) {
        router.replace('/(auth)/login');
      }
    } else if (!onboardingCompleted) {
      // Session but not onboarded
      console.log('🧭 [Nav] Has session but onboarding NOT completed, redirecting to onboarding');
      if (!inOnboarding) {
        router.replace('/onboarding');
      }
    } else {
      // Fully authenticated and onboarded
      console.log('🧭 [Nav] Fully authenticated! Redirecting to tabs');
      if (inAuthGroup || inOnboarding) {
        router.replace('/(tabs)');
      }
    }
  }, [session, loading, onboardingCompleted, segments]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? ClarityDarkTheme : ClarityLightTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="check-in" options={{ presentation: 'modal' }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack>
    </ThemeProvider>
  );
}
