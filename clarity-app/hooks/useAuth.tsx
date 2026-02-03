import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, signIn, signUp, signOut } from '../lib/supabase';
import { api } from '../lib/api';

const ONBOARDING_KEY = '@clarity_onboarding_completed';

interface AuthContextType {
    session: Session | null;
    user: User | null;
    loading: boolean;
    signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
    signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
    signOut: () => Promise<void>;
    onboardingCompleted: boolean;
    setOnboardingCompleted: (completed: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [onboardingCompleted, setOnboardingCompleted] = useState(false);

    // Load persisted onboarding status
    useEffect(() => {
        console.log('🔐 [Auth] Loading onboarding status from storage...');
        AsyncStorage.getItem(ONBOARDING_KEY).then((value) => {
            console.log('🔐 [Auth] Stored onboarding value:', value);
            if (value === 'true') {
                console.log('🔐 [Auth] Setting onboardingCompleted = true');
                setOnboardingCompleted(true);
            } else {
                console.log('🔐 [Auth] Onboarding not completed yet');
            }
        }).catch((err) => {
            console.log('🔐 [Auth] Error loading onboarding status:', err);
        });
    }, []);

    useEffect(() => {
        // Get initial session
        console.log('🔐 [Auth] Getting initial session...');
        supabase.auth.getSession().then(({ data: { session }, error }) => {
            console.log('🔐 [Auth] Got session:', session ? 'YES' : 'NO', 'Error:', error?.message || 'none');
            // Handle invalid refresh token error
            if (error && error.message?.includes('Refresh Token')) {
                console.log('🔐 [Auth] Invalid refresh token, signing out...');
                supabase.auth.signOut();
                setSession(null);
                setUser(null);
                setLoading(false);
                return;
            }

            console.log('🔐 [Auth] Setting session and user, userId:', session?.user?.id);
            setSession(session);
            setUser(session?.user ?? null);
            if (session?.access_token) {
                api.setToken(session.access_token);
            }
            console.log('🔐 [Auth] Setting loading = false');
            setLoading(false);
        }).catch((error) => {
            // Handle any auth errors by signing out
            console.log('🔑 Auth error, signing out:', error.message);
            supabase.auth.signOut();
            setSession(null);
            setUser(null);
            setLoading(false);
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            console.log('🔐 [Auth] Auth state changed! Event:', event, 'Session:', session ? 'YES' : 'NO');
            // Handle token refresh errors
            if (event === 'TOKEN_REFRESHED' && !session) {
                console.log('🔐 [Auth] Token refresh failed, signing out...');
                supabase.auth.signOut();
                setSession(null);
                setUser(null);
                return;
            }

            console.log('🔐 [Auth] Updating session, userId:', session?.user?.id);
            setSession(session);
            setUser(session?.user ?? null);
            if (session?.access_token) {
                api.setToken(session.access_token);
            } else {
                api.setToken(null);
            }
        });

        return () => subscription.unsubscribe();
    }, []);


    const handleSignIn = async (email: string, password: string) => {
        try {
            const { error } = await signIn(email, password);
            if (error) throw error;
            return { error: null };
        } catch (error) {
            return { error: error as Error };
        }
    };

    const handleSignUp = async (email: string, password: string) => {
        try {
            const { error } = await signUp(email, password);
            if (error) throw error;
            return { error: null };
        } catch (error) {
            return { error: error as Error };
        }
    };

    const handleSignOut = async () => {
        await signOut();
        setOnboardingCompleted(false);
        await AsyncStorage.removeItem(ONBOARDING_KEY);
    };

    const handleSetOnboardingCompleted = async (completed: boolean) => {
        setOnboardingCompleted(completed);
        try {
            if (completed) {
                await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
            } else {
                await AsyncStorage.removeItem(ONBOARDING_KEY);
            }
        } catch (err) {
            console.log('Error saving onboarding status:', err);
        }
    };

    return (
        <AuthContext.Provider
            value={{
                session,
                user,
                loading,
                signIn: handleSignIn,
                signUp: handleSignUp,
                signOut: handleSignOut,
                onboardingCompleted,
                setOnboardingCompleted: handleSetOnboardingCompleted,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
