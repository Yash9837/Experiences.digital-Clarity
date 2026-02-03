/**
 * Google Fit REST API Service for iOS
 * Uses OAuth 2.0 and REST API to fetch health data from Google Fit
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';

const GOOGLE_FIT_TOKENS_KEY = '@clarity_google_fit_tokens';
const GOOGLE_FIT_IOS_ENABLED_KEY = '@clarity_google_fit_ios_enabled';

// Google OAuth configuration for iOS
// Create an iOS OAuth Client ID in Google Cloud Console with:
// - Bundle ID: com.anonymous.clarityapp
// The iOS OAuth client ID looks like: xxx.apps.googleusercontent.com
const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_FIT_IOS_CLIENT_ID || '';

// For iOS OAuth, Google uses a reversed client ID as the URL scheme
// Format: com.googleusercontent.apps.{client-id-prefix}
const getReversedClientId = () => {
    if (!GOOGLE_CLIENT_ID) return '';
    // Extract the numeric part before .apps.googleusercontent.com
    const match = GOOGLE_CLIENT_ID.match(/^([^.]+)\.apps\.googleusercontent\.com$/);
    if (match) {
        return `com.googleusercontent.apps.${match[1]}`;
    }
    return '';
};

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_FIT_API_BASE = 'https://www.googleapis.com/fitness/v1/users/me';

// Required scopes for Google Fit
const SCOPES = [
    'https://www.googleapis.com/auth/fitness.activity.read',
    'https://www.googleapis.com/auth/fitness.body.read',
    'https://www.googleapis.com/auth/fitness.sleep.read',
    'https://www.googleapis.com/auth/fitness.heart_rate.read',
].join(' ');

interface GoogleTokens {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
}

export interface HealthData {
    sleepDuration?: number;
    sleepQuality?: string;
    steps?: number;
    hrv?: number;
    restingHeartRate?: number;
    activeCalories?: number;
}

export interface DailyHealthData {
    date: string; // YYYY-MM-DD format
    sleepDuration: number | null;
    sleepQuality: string | null;
    steps: number | null;
    hrv: number | null;
    restingHeartRate: number | null;
    activeCalories: number | null;
}


/**
 * Check if Google Fit is enabled for iOS
 */
export async function isGoogleFitIOSEnabled(): Promise<boolean> {
    const value = await AsyncStorage.getItem(GOOGLE_FIT_IOS_ENABLED_KEY);
    return value === 'true';
}

/**
 * Set Google Fit enabled state for iOS
 */
export async function setGoogleFitIOSEnabled(enabled: boolean): Promise<void> {
    await AsyncStorage.setItem(GOOGLE_FIT_IOS_ENABLED_KEY, enabled ? 'true' : 'false');
}

/**
 * Get stored Google Fit tokens
 */
async function getStoredTokens(): Promise<GoogleTokens | null> {
    try {
        const tokensStr = await AsyncStorage.getItem(GOOGLE_FIT_TOKENS_KEY);
        if (tokensStr) {
            return JSON.parse(tokensStr);
        }
    } catch (e) {
        console.log('Failed to get stored tokens:', e);
    }
    return null;
}

/**
 * Store Google Fit tokens
 */
async function storeTokens(tokens: GoogleTokens): Promise<void> {
    await AsyncStorage.setItem(GOOGLE_FIT_TOKENS_KEY, JSON.stringify(tokens));
}

/**
 * Clear stored tokens (for sign out)
 */
export async function clearGoogleFitTokens(): Promise<void> {
    await AsyncStorage.removeItem(GOOGLE_FIT_TOKENS_KEY);
    await AsyncStorage.removeItem(GOOGLE_FIT_IOS_ENABLED_KEY);
}

/**
 * Refresh the access token if expired
 */
async function refreshAccessToken(refreshToken: string): Promise<GoogleTokens | null> {
    if (!GOOGLE_CLIENT_ID) {
        console.log('❌ Google Client ID not configured');
        return null;
    }

    try {
        const response = await fetch(GOOGLE_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: GOOGLE_CLIENT_ID,
                refresh_token: refreshToken,
                grant_type: 'refresh_token',
            }).toString(),
        });

        const data = await response.json();

        if (data.access_token) {
            const tokens: GoogleTokens = {
                accessToken: data.access_token,
                refreshToken: refreshToken,
                expiresAt: Date.now() + (data.expires_in * 1000),
            };
            await storeTokens(tokens);
            return tokens;
        }
    } catch (e) {
        console.error('Token refresh failed:', e);
    }
    return null;
}

/**
 * Get a valid access token (refresh if needed)
 */
async function getValidAccessToken(): Promise<string | null> {
    const tokens = await getStoredTokens();
    if (!tokens) {
        return null;
    }

    // Check if token is expired (with 5 min buffer)
    if (Date.now() >= tokens.expiresAt - 300000) {
        console.log('🔄 Access token expired, refreshing...');
        const newTokens = await refreshAccessToken(tokens.refreshToken);
        return newTokens?.accessToken || null;
    }

    return tokens.accessToken;
}

/**
 * Initialize Google Fit OAuth flow for iOS
 */
export async function initializeGoogleFitIOS(): Promise<boolean> {
    console.log('🔄 Starting Google Fit OAuth for iOS...');

    if (!GOOGLE_CLIENT_ID) {
        console.log('❌ Google Client ID not configured. Set EXPO_PUBLIC_GOOGLE_FIT_IOS_CLIENT_ID in .env');
        return false;
    }

    const reversedClientId = getReversedClientId();
    if (!reversedClientId) {
        console.log('❌ Could not generate reversed client ID');
        return false;
    }

    try {
        // For iOS, the redirect URI uses the reversed client ID as URL scheme
        // Format: com.googleusercontent.apps.{client-id-prefix}:/oauth2redirect
        const redirectUri = `${reversedClientId}:/oauth2redirect`;
        console.log('📱 Redirect URI:', redirectUri);

        // Build authorization URL
        const authUrl = `${GOOGLE_AUTH_URL}?` + new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            redirect_uri: redirectUri,
            response_type: 'code',
            scope: SCOPES,
            access_type: 'offline',
            prompt: 'consent',
        }).toString();

        // Open browser for authentication
        const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

        if (result.type === 'success' && result.url) {
            console.log('✅ OAuth redirect received');

            // Extract authorization code from URL
            const url = new URL(result.url);
            const code = url.searchParams.get('code');

            if (!code) {
                console.log('❌ No authorization code in response');
                return false;
            }

            // Exchange code for tokens
            const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    client_id: GOOGLE_CLIENT_ID,
                    code: code,
                    redirect_uri: redirectUri,
                    grant_type: 'authorization_code',
                }).toString(),
            });

            const tokenData = await tokenResponse.json();

            if (tokenData.access_token) {
                const tokens: GoogleTokens = {
                    accessToken: tokenData.access_token,
                    refreshToken: tokenData.refresh_token || '',
                    expiresAt: Date.now() + (tokenData.expires_in * 1000),
                };

                await storeTokens(tokens);
                await setGoogleFitIOSEnabled(true);
                console.log('✅ Google Fit authorized successfully for iOS');
                return true;
            } else {
                console.log('❌ Failed to get tokens:', tokenData);
                return false;
            }
        } else if (result.type === 'cancel') {
            console.log('❌ User cancelled OAuth flow');
            return false;
        } else {
            console.log('❌ OAuth failed:', result);
            return false;
        }
    } catch (e) {
        console.error('❌ Google Fit iOS OAuth error:', e);
        return false;
    }
}

/**
 * Fetch health data from Google Fit REST API
 */
export async function fetchGoogleFitIOSData(): Promise<HealthData | null> {
    console.log('🔍 [GoogleFit iOS] Starting data fetch...');

    const accessToken = await getValidAccessToken();
    if (!accessToken) {
        console.log('❌ [GoogleFit iOS] No valid token');
        return null;
    }

    const healthData: HealthData = {};
    const endTime = new Date();
    endTime.setHours(0, 0, 0, 0);
    const startTime = new Date(endTime);
    startTime.setDate(startTime.getDate() - 1);

    const startTimeMs = startTime.getTime();
    const endTimeMs = endTime.getTime();
    console.log(`📅 Date range: ${startTime.toLocaleDateString()} - ${endTime.toLocaleDateString()}`);

    const headers = {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
    };

    // Fetch steps
    try {
        const res = await fetch(`${GOOGLE_FIT_API_BASE}/dataset:aggregate`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                aggregateBy: [{ dataTypeName: 'com.google.step_count.delta' }],
                bucketByTime: { durationMillis: endTimeMs - startTimeMs },
                startTimeMillis: startTimeMs,
                endTimeMillis: endTimeMs,
            }),
        });
        const data = await res.json();
        const steps = data.bucket?.[0]?.dataset?.[0]?.point?.[0]?.value?.[0]?.intVal;
        if (steps) {
            healthData.steps = steps;
            console.log(`✅ Steps: ${steps}`);
        } else {
            console.log('⚠️ Steps: no data');
        }
    } catch (e) {
        console.log('❌ Steps: error', e);
    }

    // Fetch calories
    try {
        const res = await fetch(`${GOOGLE_FIT_API_BASE}/dataset:aggregate`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                aggregateBy: [{ dataTypeName: 'com.google.calories.expended' }],
                bucketByTime: { durationMillis: endTimeMs - startTimeMs },
                startTimeMillis: startTimeMs,
                endTimeMillis: endTimeMs,
            }),
        });
        const data = await res.json();
        const cal = data.bucket?.[0]?.dataset?.[0]?.point?.[0]?.value?.[0]?.fpVal;
        if (cal) {
            healthData.activeCalories = Math.round(cal);
            console.log(`✅ Calories: ${healthData.activeCalories} kcal`);
        } else {
            console.log('⚠️ Calories: no data');
        }
    } catch (e) {
        console.log('❌ Calories: error', e);
    }

    // Fetch heart rate (from Vitals - used as restingHeartRate)
    try {
        const res = await fetch(`${GOOGLE_FIT_API_BASE}/dataset:aggregate`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                aggregateBy: [{ dataTypeName: 'com.google.heart_rate.bpm' }],
                bucketByTime: { durationMillis: endTimeMs - startTimeMs },
                startTimeMillis: startTimeMs,
                endTimeMillis: endTimeMs,
            }),
        });
        const data = await res.json();
        const points = data.bucket?.[0]?.dataset?.[0]?.point;
        if (points && points.length > 0) {
            const sum = points.reduce((acc: number, p: any) => acc + (p.value[0]?.fpVal || 0), 0);
            healthData.restingHeartRate = Math.round(sum / points.length);
            console.log(`✅ Heart Rate: ${healthData.restingHeartRate} bpm (${points.length} samples)`);
        } else {
            console.log('⚠️ Heart Rate: no data');
        }
    } catch (e) {
        console.log('❌ Heart Rate: error', e);
    }

    // Fetch sleep
    try {
        const res = await fetch(
            `${GOOGLE_FIT_API_BASE}/sessions?startTime=${startTime.toISOString()}&endTime=${endTime.toISOString()}&activityType=72`,
            { headers }
        );
        const data = await res.json();
        if (data.session && data.session.length > 0) {
            let totalMs = 0;
            for (const s of data.session) {
                totalMs += parseInt(s.endTimeMillis) - parseInt(s.startTimeMillis);
            }
            healthData.sleepDuration = Math.round(totalMs / (1000 * 60 * 60) * 10) / 10;
            healthData.sleepQuality = healthData.sleepDuration >= 7 ? 'good' : healthData.sleepDuration >= 6 ? 'fair' : 'poor';
            console.log(`✅ Sleep: ${healthData.sleepDuration}h (${data.session.length} sessions)`);
        } else {
            console.log('⚠️ Sleep: no data');
        }
    } catch (e) {
        console.log('❌ Sleep: error', e);
    }

    // Summary
    const received = Object.keys(healthData).filter(k => healthData[k as keyof HealthData] !== undefined);
    const missing = ['steps', 'activeCalories', 'restingHeartRate', 'sleepDuration'].filter(k => !received.includes(k));
    console.log(`📊 [GoogleFit iOS] Done. Got: ${received.join(', ') || 'nothing'} | Missing: ${missing.join(', ') || 'none'}`);

    return Object.keys(healthData).length > 0 ? healthData : null;
}

/**
 * Fetch health data for the last 7 days from Google Fit REST API
 * Returns array of daily data with null handling
 */
export async function fetchGoogleFitIOSWeekData(): Promise<DailyHealthData[]> {
    console.log('🔍 [GoogleFit iOS] Fetching week data...');

    const accessToken = await getValidAccessToken();
    if (!accessToken) {
        console.log('❌ [GoogleFit iOS] No valid token');
        return [];
    }

    const weekData: DailyHealthData[] = [];
    const headers = {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
    };

    // Calculate date range for last 7 days
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const endTimeMs = now.getTime();
    const startTime = new Date(now);
    startTime.setDate(startTime.getDate() - 7);
    const startTimeMs = startTime.getTime();

    const oneDayMs = 24 * 60 * 60 * 1000;

    console.log(`📅 Week range: ${startTime.toLocaleDateString()} - ${now.toLocaleDateString()}`);

    // Initialize daily data objects
    for (let i = 0; i < 7; i++) {
        const date = new Date(startTime);
        date.setDate(date.getDate() + i);
        weekData.push({
            date: date.toISOString().split('T')[0],
            sleepDuration: null,
            sleepQuality: null,
            steps: null,
            hrv: null,
            restingHeartRate: null,
            activeCalories: null,
        });
    }

    // Fetch steps for the week (with daily buckets)
    try {
        const res = await fetch(`${GOOGLE_FIT_API_BASE}/dataset:aggregate`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                aggregateBy: [{ dataTypeName: 'com.google.step_count.delta' }],
                bucketByTime: { durationMillis: oneDayMs },
                startTimeMillis: startTimeMs,
                endTimeMillis: endTimeMs,
            }),
        });
        const data = await res.json();
        if (data.bucket) {
            data.bucket.forEach((bucket: any, idx: number) => {
                const steps = bucket.dataset?.[0]?.point?.[0]?.value?.[0]?.intVal;
                if (steps && weekData[idx]) {
                    weekData[idx].steps = steps;
                }
            });
            console.log(`✅ Steps: ${data.bucket.length} days fetched`);
        }
    } catch (e) {
        console.log('❌ Steps: error', e);
    }

    // Fetch calories for the week
    try {
        const res = await fetch(`${GOOGLE_FIT_API_BASE}/dataset:aggregate`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                aggregateBy: [{ dataTypeName: 'com.google.calories.expended' }],
                bucketByTime: { durationMillis: oneDayMs },
                startTimeMillis: startTimeMs,
                endTimeMillis: endTimeMs,
            }),
        });
        const data = await res.json();
        if (data.bucket) {
            data.bucket.forEach((bucket: any, idx: number) => {
                const cal = bucket.dataset?.[0]?.point?.[0]?.value?.[0]?.fpVal;
                if (cal && weekData[idx]) {
                    weekData[idx].activeCalories = Math.round(cal);
                }
            });
            console.log(`✅ Calories: ${data.bucket.length} days fetched`);
        }
    } catch (e) {
        console.log('❌ Calories: error', e);
    }

    // Fetch heart rate for the week
    try {
        const res = await fetch(`${GOOGLE_FIT_API_BASE}/dataset:aggregate`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                aggregateBy: [{ dataTypeName: 'com.google.heart_rate.bpm' }],
                bucketByTime: { durationMillis: oneDayMs },
                startTimeMillis: startTimeMs,
                endTimeMillis: endTimeMs,
            }),
        });
        const data = await res.json();
        if (data.bucket) {
            data.bucket.forEach((bucket: any, idx: number) => {
                const points = bucket.dataset?.[0]?.point;
                if (points && points.length > 0 && weekData[idx]) {
                    const sum = points.reduce((acc: number, p: any) => acc + (p.value[0]?.fpVal || 0), 0);
                    weekData[idx].restingHeartRate = Math.round(sum / points.length);
                }
            });
            console.log(`✅ Heart Rate: ${data.bucket.length} days fetched`);
        }
    } catch (e) {
        console.log('❌ Heart Rate: error', e);
    }

    // Fetch sleep sessions for the week
    try {
        const res = await fetch(
            `${GOOGLE_FIT_API_BASE}/sessions?startTime=${startTime.toISOString()}&endTime=${now.toISOString()}&activityType=72`,
            { headers }
        );
        const data = await res.json();
        if (data.session && data.session.length > 0) {
            // Group sleep sessions by day
            for (const session of data.session) {
                const sessionDate = new Date(parseInt(session.startTimeMillis));
                const dateStr = sessionDate.toISOString().split('T')[0];
                const dayData = weekData.find(d => d.date === dateStr);
                if (dayData) {
                    const durationMs = parseInt(session.endTimeMillis) - parseInt(session.startTimeMillis);
                    const durationHours = durationMs / (1000 * 60 * 60);
                    dayData.sleepDuration = (dayData.sleepDuration || 0) + Math.round(durationHours * 10) / 10;
                    dayData.sleepQuality = dayData.sleepDuration >= 7 ? 'good' : dayData.sleepDuration >= 6 ? 'fair' : 'poor';
                }
            }
            console.log(`✅ Sleep: ${data.session.length} sessions grouped by day`);
        }
    } catch (e) {
        console.log('❌ Sleep: error', e);
    }

    // Log summary
    const daysWithData = weekData.filter(d => d.steps !== null || d.activeCalories !== null || d.restingHeartRate !== null || d.sleepDuration !== null);
    console.log(`📊 [GoogleFit iOS] Week done. ${daysWithData.length}/7 days have data`);

    return weekData;
}
