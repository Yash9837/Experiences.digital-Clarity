import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

// Supabase configuration
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'your-anon-key';

// Custom storage adapter that handles SSR (server-side rendering)
const ExpoSecureStoreAdapter = {
    getItem: async (key: string): Promise<string | null> => {
        try {
            // Check if we're in a browser environment
            if (Platform.OS === 'web' && typeof window === 'undefined') {
                return null;
            }
            return await AsyncStorage.getItem(key);
        } catch {
            return null;
        }
    },
    setItem: async (key: string, value: string): Promise<void> => {
        try {
            if (Platform.OS === 'web' && typeof window === 'undefined') {
                return;
            }
            await AsyncStorage.setItem(key, value);
        } catch {
            // Ignore storage errors
        }
    },
    removeItem: async (key: string): Promise<void> => {
        try {
            if (Platform.OS === 'web' && typeof window === 'undefined') {
                return;
            }
            await AsyncStorage.removeItem(key);
        } catch {
            // Ignore storage errors
        }
    },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage: ExpoSecureStoreAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
});

// Auth helper functions
export const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
    });
    return { data, error };
};

export const signIn = async (email: string, password: string) => {
    console.log('📡 [Supabase] signIn called');
    console.log('📡 [Supabase] URL:', supabaseUrl);

    try {
        // Add timeout to prevent infinite hang
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Sign in timed out after 15 seconds. Check your network connection.')), 15000);
        });

        const signInPromise = supabase.auth.signInWithPassword({
            email,
            password,
        });

        console.log('📡 [Supabase] Calling signInWithPassword...');
        const result = await Promise.race([signInPromise, timeoutPromise]) as Awaited<typeof signInPromise>;

        console.log('📡 [Supabase] signIn result - error:', result.error?.message || 'none');
        console.log('📡 [Supabase] signIn result - user:', result.data?.user?.id || 'none');

        return { data: result.data, error: result.error };
    } catch (err) {
        console.log('📡 [Supabase] signIn exception:', err);
        return { data: null, error: err as Error };
    }
};

export const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
};

export const getSession = async () => {
    const { data, error } = await supabase.auth.getSession();
    return { session: data.session, error };
};

export const getCurrentUser = async () => {
    const { data: { user }, error } = await supabase.auth.getUser();
    return { user, error };
};
