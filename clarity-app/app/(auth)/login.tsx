import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import Colors from '@/constants/Colors';

export default function LoginScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const { signIn } = useAuth();
    const router = useRouter();

    const handleLogin = async () => {
        console.log('🔐 [Login] Sign In button pressed');
        console.log('🔐 [Login] Email:', email);

        if (!email || !password) {
            console.log('🔐 [Login] Missing email or password');
            Alert.alert('Error', 'Please enter your email and password');
            return;
        }

        console.log('🔐 [Login] Starting sign in...');
        setLoading(true);

        try {
            const { error } = await signIn(email, password);
            console.log('🔐 [Login] Sign in completed, error:', error);
            setLoading(false);

            if (error) {
                console.log('🔐 [Login] Sign in failed:', error.message);
                Alert.alert('Login Failed', error.message);
            } else {
                console.log('🔐 [Login] Sign in SUCCESS! Waiting for auth state change...');
            }
        } catch (err) {
            console.log('🔐 [Login] Exception during sign in:', err);
            setLoading(false);
            Alert.alert('Login Error', 'An unexpected error occurred');
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}
        >
            <View style={styles.content}>
                {/* Logo/Brand */}
                <View style={styles.header}>
                    <Text style={styles.logo}>✨</Text>
                    <Text style={styles.title}>Clarity</Text>
                    <Text style={styles.subtitle}>Your daily energy companion</Text>
                </View>

                {/* Form */}
                <View style={styles.form}>
                    <View style={styles.inputContainer}>
                        <Text style={styles.label}>Email</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="you@example.com"
                            placeholderTextColor={Colors.neutral[400]}
                            value={email}
                            onChangeText={setEmail}
                            autoCapitalize="none"
                            keyboardType="email-address"
                            autoComplete="email"
                        />
                    </View>

                    <View style={styles.inputContainer}>
                        <Text style={styles.label}>Password</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Enter your password"
                            placeholderTextColor={Colors.neutral[400]}
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry
                            autoComplete="password"
                        />
                    </View>

                    <TouchableOpacity
                        style={[styles.button, loading && styles.buttonDisabled]}
                        onPress={handleLogin}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={styles.buttonText}>Sign In</Text>
                        )}
                    </TouchableOpacity>
                </View>

                {/* Footer */}
                <View style={styles.footer}>
                    <Text style={styles.footerText}>Don't have an account? </Text>
                    <Link href="/(auth)/signup" asChild>
                        <TouchableOpacity>
                            <Text style={styles.linkText}>Sign Up</Text>
                        </TouchableOpacity>
                    </Link>
                </View>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background.primary,
    },
    content: {
        flex: 1,
        padding: 24,
        justifyContent: 'center',
    },
    header: {
        alignItems: 'center',
        marginBottom: 48,
    },
    logo: {
        fontSize: 72,
        marginBottom: 20,
    },
    title: {
        fontSize: 40,
        fontWeight: '800',
        color: Colors.text.primary,
        marginBottom: 10,
        letterSpacing: -1,
    },
    subtitle: {
        fontSize: 17,
        color: Colors.text.secondary,
        fontWeight: '500',
    },
    form: {
        marginBottom: 32,
    },
    inputContainer: {
        marginBottom: 20,
    },
    label: {
        fontSize: 14,
        fontWeight: '700',
        color: Colors.text.primary,
        marginBottom: 10,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    input: {
        backgroundColor: '#fff',
        borderRadius: 14,
        padding: 18,
        fontSize: 16,
        color: Colors.text.primary,
        borderWidth: 2,
        borderColor: Colors.neutral[200],
        fontWeight: '500',
        shadowColor: Colors.neutral[900],
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 1,
    },
    button: {
        backgroundColor: Colors.primary[500],
        borderRadius: 14,
        padding: 18,
        alignItems: 'center',
        marginTop: 12,
        shadowColor: Colors.primary[600],
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
        elevation: 4,
    },
    buttonDisabled: {
        opacity: 0.6,
        shadowOpacity: 0,
    },
    buttonText: {
        color: '#fff',
        fontSize: 17,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
    },
    footerText: {
        fontSize: 15,
        color: Colors.text.secondary,
        fontWeight: '500',
    },
    linkText: {
        fontSize: 15,
        color: Colors.primary[600],
        fontWeight: '700',
    },
});
