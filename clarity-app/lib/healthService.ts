import { Platform, Linking, PermissionsAndroid } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';

// Check if we're in Expo Go (health APIs won't work)
const isExpoGo = Constants.appOwnership === 'expo';

// Use any types for dynamically imported modules due to type resolution issues
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let AppleHealthKit: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any  
let HealthConnect: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let GoogleFit: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let GoogleFitScopes: any = null;

if (!isExpoGo) {
    if (Platform.OS === 'ios') {
        try {
            AppleHealthKit = require('react-native-health').default;
        } catch (e) {
            console.log('Apple HealthKit not available:', e);
        }
    } else if (Platform.OS === 'android') {
        try {
            HealthConnect = require('react-native-health-connect');
        } catch (e) {
            console.log('Health Connect not available:', e);
        }
        // Also try to load Google Fit as fallback/additional source
        try {
            const googleFitModule = require('react-native-google-fit');
            GoogleFit = googleFitModule.default;
            GoogleFitScopes = googleFitModule.Scopes;
        } catch (e) {
            console.log('Google Fit not available:', e);
        }
    }
}

const HEALTH_LAST_SYNC_KEY = '@clarity_health_last_sync';
const USE_MOCK_DATA_KEY = '@clarity_use_mock_health_data';
const USE_GOOGLE_FIT_KEY = '@clarity_use_google_fit';

export interface HealthData {
    sleepDuration?: number; // hours
    sleepQuality?: string;
    steps?: number;
    hrv?: number; // Heart Rate Variability in ms
    restingHeartRate?: number;
    activeCalories?: number;
}

/**
 * Generate realistic mock health data for testing
 */
function generateMockHealthData(): HealthData {
    // Generate somewhat realistic random values
    const sleepHours = 6 + Math.random() * 2.5; // 6-8.5 hours
    const steps = Math.floor(5000 + Math.random() * 8000); // 5,000-13,000 steps
    const hrv = Math.floor(30 + Math.random() * 50); // 30-80 ms
    const restingHr = Math.floor(55 + Math.random() * 20); // 55-75 bpm
    const calories = Math.floor(200 + Math.random() * 400); // 200-600 kcal

    return {
        sleepDuration: Math.round(sleepHours * 10) / 10,
        sleepQuality: sleepHours >= 7 ? 'good' : sleepHours >= 6 ? 'fair' : 'poor',
        steps,
        hrv,
        restingHeartRate: restingHr,
        activeCalories: calories,
    };
}

/**
 * Enable or disable mock health data (for testing)
 */
export async function setUseMockHealthData(useMock: boolean): Promise<void> {
    await AsyncStorage.setItem(USE_MOCK_DATA_KEY, useMock ? 'true' : 'false');
    console.log(`🧪 Mock health data ${useMock ? 'enabled' : 'disabled'}`);
}

/**
 * Check if mock health data is enabled
 */
export async function isUsingMockHealthData(): Promise<boolean> {
    const value = await AsyncStorage.getItem(USE_MOCK_DATA_KEY);
    return value === 'true';
}

/**
 * Check if health features are supported on this device
 */
export function isHealthSupported(): boolean {
    if (isExpoGo) return false;
    if (Platform.OS === 'ios') return AppleHealthKit !== null;
    if (Platform.OS === 'android') return HealthConnect !== null;
    return false;
}

/**
 * Get the health platform name
 */
export function getHealthPlatformName(): string {
    if (Platform.OS === 'ios') return 'Apple Health';
    if (Platform.OS === 'android') return 'Health Connect';
    return 'Health';
}

/**
 * Open Health Connect settings on Android
 */
export async function openHealthConnectSettings(): Promise<void> {
    if (Platform.OS === 'android' && HealthConnect) {
        try {
            await HealthConnect.openHealthConnectSettings();
        } catch (e) {
            // Fallback: try opening via intent
            try {
                await Linking.openSettings();
            } catch (linkError) {
                console.error('Failed to open settings:', linkError);
            }
        }
    } else if (Platform.OS === 'ios') {
        // Open iOS Health app settings
        await Linking.openURL('x-apple-health://');
    }
}

/**
 * Check if Health Connect is available and installed
 */
export async function checkHealthConnectAvailability(): Promise<{ available: boolean; status: string }> {
    if (Platform.OS !== 'android' || !HealthConnect) {
        return { available: false, status: 'not_android' };
    }

    try {
        const status = await HealthConnect.getSdkStatus();
        if (status === HealthConnect.SdkAvailabilityStatus.SDK_AVAILABLE) {
            return { available: true, status: 'available' };
        } else if (status === HealthConnect.SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) {
            return { available: false, status: 'update_required' };
        } else {
            return { available: false, status: 'not_installed' };
        }
    } catch (e) {
        console.error('Health Connect availability check error:', e);
        return { available: false, status: 'error' };
    }
}

// ============ GOOGLE FIT INTEGRATION ============

// Import iOS Google Fit REST API service
import {
    isGoogleFitIOSEnabled,
    setGoogleFitIOSEnabled,
    initializeGoogleFitIOS,
    fetchGoogleFitIOSData,
    fetchGoogleFitIOSWeekData,
    clearGoogleFitTokens,
    DailyHealthData,
} from './googleFitIOS';

// Re-export for use in settings
export { isGoogleFitIOSEnabled, clearGoogleFitTokens };

/**
 * Check if Google Fit is available (Android native or iOS via REST API)
 */
export function isGoogleFitAvailable(): boolean {
    // On Android, check for native Google Fit library
    if (Platform.OS === 'android') {
        return GoogleFit !== null && !isExpoGo;
    }
    // On iOS, Google Fit is available via REST API (always available when not in Expo Go)
    if (Platform.OS === 'ios') {
        return !isExpoGo;
    }
    return false;
}

/**
 * Initialize and authorize Google Fit
 */
export async function initializeGoogleFit(): Promise<boolean> {
    console.log('🔄 Starting Google Fit initialization...');

    if (!isGoogleFitAvailable()) {
        console.log('❌ Google Fit not available');
        return false;
    }

    // iOS uses REST API with OAuth
    if (Platform.OS === 'ios') {
        console.log('📱 iOS detected, using Google Fit REST API...');
        return await initializeGoogleFitIOS();
    }

    // Android uses native Google Fit library
    console.log('✅ Google Fit library loaded');

    if (!GoogleFitScopes) {
        console.log('❌ Google Fit Scopes not available');
        return false;
    }
    console.log('✅ Google Fit Scopes available:', Object.keys(GoogleFitScopes));

    try {
        // Request ACTIVITY_RECOGNITION permission (required for step count on Android 10+)
        if (Platform.OS === 'android' && Platform.Version >= 29) {
            console.log('📱 Android version >= 29, requesting ACTIVITY_RECOGNITION...');
            const activityPermission = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION,
                {
                    title: 'Activity Recognition Permission',
                    message: 'Clarity needs access to your activity data to track steps and activity.',
                    buttonNeutral: 'Ask Me Later',
                    buttonNegative: 'Cancel',
                    buttonPositive: 'OK',
                }
            );

            console.log('📱 ACTIVITY_RECOGNITION result:', activityPermission);
            if (activityPermission !== PermissionsAndroid.RESULTS.GRANTED) {
                console.log('❌ ACTIVITY_RECOGNITION permission denied');
                // Continue anyway - other data might still work
            } else {
                console.log('✅ ACTIVITY_RECOGNITION permission granted');
            }
        }

        const scopes = [
            GoogleFitScopes.FITNESS_ACTIVITY_READ,
            GoogleFitScopes.FITNESS_BODY_READ,
            GoogleFitScopes.FITNESS_SLEEP_READ,
            GoogleFitScopes.FITNESS_HEART_RATE_READ,
        ];
        console.log('🔑 Requesting authorization with scopes:', scopes);

        const options = { scopes };
        const result = await GoogleFit.authorize(options);

        console.log('📊 Google Fit authorize result:', JSON.stringify(result, null, 2));

        if (result.success) {
            console.log('✅ Google Fit authorized successfully');
            await AsyncStorage.setItem(USE_GOOGLE_FIT_KEY, 'true');
            return true;
        } else {
            console.log('❌ Google Fit authorization failed');
            console.log('   Message:', result.message);
            console.log('   Full result:', JSON.stringify(result));
            return false;
        }
    } catch (e: any) {
        console.error('❌ Google Fit initialization error:', e);
        console.error('   Error name:', e?.name);
        console.error('   Error message:', e?.message);
        console.error('   Error stack:', e?.stack);
        return false;
    }
}

/**
 * Check if Google Fit is enabled
 */
export async function isGoogleFitEnabled(): Promise<boolean> {
    // iOS uses different storage key
    if (Platform.OS === 'ios') {
        return await isGoogleFitIOSEnabled();
    }
    const value = await AsyncStorage.getItem(USE_GOOGLE_FIT_KEY);
    return value === 'true';
}

/**
 * Fetch health data from Google Fit
 */
export async function fetchGoogleFitData(): Promise<HealthData | null> {
    if (!isGoogleFitAvailable()) {
        console.log('Google Fit not available');
        return null;
    }

    // iOS uses REST API
    if (Platform.OS === 'ios') {
        console.log('📱 Fetching from Google Fit REST API (iOS)...');
        return await fetchGoogleFitIOSData();
    }

    // Android uses native library - check if properly authorized
    try {
        const isAuthorized = await GoogleFit.isAuthorized;
        if (!isAuthorized) {
            console.log('Google Fit not authorized, attempting to authorize...');
            const authResult = await initializeGoogleFit();
            if (!authResult) {
                console.log('Google Fit authorization failed');
                return null;
            }
        }
    } catch (e) {
        console.log('Google Fit authorization check failed:', e);
        return null;
    }

    const { startDate, endDate } = getYesterdayDateRange();
    const healthData: HealthData = {};

    // Fetch steps (requires ACTIVITY_RECOGNITION)
    try {
        const stepsResult = await GoogleFit.getDailyStepCountSamples({
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
        });
        console.log('🔍 Raw Steps Result:', JSON.stringify(stepsResult, null, 2));

        if (stepsResult && stepsResult.length > 0) {
            const mergedSteps = stepsResult.find((s: any) => s.source === 'com.google.android.gms:merge_step_deltas');
            const estimatedSteps = stepsResult.find((s: any) => s.source === 'com.google.android.gms:estimated_steps');
            const stepsSource = mergedSteps || estimatedSteps || stepsResult[0];

            if (stepsSource && stepsSource.steps && stepsSource.steps.length > 0) {
                healthData.steps = stepsSource.steps.reduce((sum: number, day: any) => sum + (day.value || 0), 0);
                console.log('📊 Steps fetched:', healthData.steps);
            }
        }
    } catch (e) {
        console.log('⚠️ Steps fetch failed (may need ACTIVITY_RECOGNITION permission):', e);
    }

    // Fetch calories
    try {
        const caloriesResult = await GoogleFit.getDailyCalorieSamples({
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            basalCalculation: false,
        });
        console.log('🔍 Raw Calories Result:', JSON.stringify(caloriesResult, null, 2));

        if (caloriesResult && caloriesResult.length > 0) {
            healthData.activeCalories = Math.round(
                caloriesResult.reduce((sum: number, day: any) => sum + (day.calorie || 0), 0)
            );
            console.log('📊 Calories fetched:', healthData.activeCalories);
        }
    } catch (e) {
        console.log('⚠️ Calories fetch failed:', e);
    }

    // Fetch heart rate
    try {
        const heartRateResult = await GoogleFit.getHeartRateSamples({
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
        });
        console.log('🔍 Raw Heart Rate Result:', JSON.stringify(heartRateResult, null, 2));

        if (heartRateResult && heartRateResult.length > 0) {
            const sortedHR = heartRateResult
                .map((hr: any) => hr.value)
                .filter((v: number) => v > 0)
                .sort((a: number, b: number) => a - b);

            if (sortedHR.length > 0) {
                const restingCount = Math.max(1, Math.floor(sortedHR.length * 0.2));
                healthData.restingHeartRate = Math.round(
                    sortedHR.slice(0, restingCount).reduce((a: number, b: number) => a + b, 0) / restingCount
                );
                console.log('📊 Heart rate fetched:', healthData.restingHeartRate);
            }
        }
    } catch (e) {
        console.log('⚠️ Heart rate fetch failed:', e);
    }

    // Fetch sleep data
    try {
        const sleepResult = await GoogleFit.getSleepSamples({
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
        });
        console.log('🔍 Raw Sleep Result:', JSON.stringify(sleepResult, null, 2));

        if (sleepResult && sleepResult.length > 0) {
            let totalSleepMinutes = 0;
            for (const session of sleepResult) {
                const start = new Date(session.startDate);
                const end = new Date(session.endDate);
                totalSleepMinutes += (end.getTime() - start.getTime()) / (1000 * 60);
            }
            healthData.sleepDuration = Math.round(totalSleepMinutes / 60 * 10) / 10;
            healthData.sleepQuality = healthData.sleepDuration >= 7 ? 'good' :
                healthData.sleepDuration >= 6 ? 'fair' : 'poor';
            console.log('📊 Sleep fetched:', healthData.sleepDuration, 'hours');
        }
    } catch (e) {
        console.log('⚠️ Sleep fetch failed:', e);
    }

    // Fetch Distance
    try {
        const distanceResult = await GoogleFit.getDailyDistanceSamples({
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
        });
        console.log('🔍 Raw Distance Result:', JSON.stringify(distanceResult, null, 2));
    } catch (e) {
        console.log('⚠️ Distance fetch failed:', e);
    }

    // Fetch Weight (Body metrics)
    try {
        const weightResult = await GoogleFit.getWeightSamples({
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
        });
        console.log('🔍 Raw Weight Result:', JSON.stringify(weightResult, null, 2));
    } catch (e) {
        console.log('⚠️ Weight fetch failed:', e);
    }

    // Fetch Activity Sessions
    try {
        const activityResult = await GoogleFit.getActivitySamples({
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
        });
        console.log('🔍 Raw Activity Sessions Result:', JSON.stringify(activityResult, null, 2));
    } catch (e) {
        console.log('⚠️ Activity fetch failed:', e);
    }

    console.log('📊 Google Fit data fetched:', healthData);
    return Object.keys(healthData).length > 0 ? healthData : null;
}

/**
 * Get yesterday's date range for health queries
 */
function getYesterdayDateRange(): { startDate: Date; endDate: Date } {
    const endDate = new Date();
    endDate.setHours(0, 0, 0, 0);

    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 1);

    return { startDate, endDate };
}

/**
 * Check if health permissions have been granted
 */
export async function checkHealthPermissions(): Promise<boolean> {
    if (!isHealthSupported()) return false;

    if (Platform.OS === 'ios' && AppleHealthKit) {
        return new Promise((resolve) => {
            AppleHealthKit.getAuthStatus(
                {
                    permissions: {
                        read: [
                            AppleHealthKit.Constants.Permissions.SleepAnalysis,
                            AppleHealthKit.Constants.Permissions.StepCount,
                            AppleHealthKit.Constants.Permissions.HeartRateVariability,
                            AppleHealthKit.Constants.Permissions.RestingHeartRate,
                            AppleHealthKit.Constants.Permissions.ActiveEnergyBurned,
                        ],
                        write: [],
                    },
                },
                (err: unknown, results: unknown) => {
                    if (err) {
                        console.error('HealthKit auth check error:', err);
                        resolve(false);
                    } else {
                        // Results indicate if permissions are granted
                        resolve(true);
                    }
                }
            );
        });
    }

    if (Platform.OS === 'android' && HealthConnect) {
        try {
            const status = await HealthConnect.getSdkStatus();
            return status === HealthConnect.SdkAvailabilityStatus.SDK_AVAILABLE;
        } catch (e) {
            console.error('Health Connect status check error:', e);
            return false;
        }
    }

    return false;
}

/**
 * Request health data permissions
 */
export async function requestHealthPermissions(): Promise<boolean> {
    if (!isHealthSupported()) {
        console.log('📱 Health features not available');
        return false;
    }

    if (Platform.OS === 'ios' && AppleHealthKit) {
        return new Promise((resolve) => {
            const permissions = {
                permissions: {
                    read: [
                        AppleHealthKit.Constants.Permissions.SleepAnalysis,
                        AppleHealthKit.Constants.Permissions.StepCount,
                        AppleHealthKit.Constants.Permissions.HeartRateVariability,
                        AppleHealthKit.Constants.Permissions.RestingHeartRate,
                        AppleHealthKit.Constants.Permissions.ActiveEnergyBurned,
                    ],
                    write: [],
                },
            };

            AppleHealthKit.initHealthKit(permissions, (err: unknown) => {
                if (err) {
                    console.error('HealthKit init error:', err);
                    resolve(false);
                } else {
                    console.log('✅ HealthKit permissions granted');
                    resolve(true);
                }
            });
        });
    }

    if (Platform.OS === 'android' && HealthConnect) {
        try {
            await HealthConnect.initialize();

            const result = await HealthConnect.requestPermission([
                { accessType: 'read', recordType: 'SleepSession' },
                { accessType: 'read', recordType: 'Steps' },
                { accessType: 'read', recordType: 'HeartRateVariabilityRmssd' },
                { accessType: 'read', recordType: 'RestingHeartRate' },
                { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
            ]);
            // Check if all permissions were granted
            const granted = result.length > 0;
            if (granted) {
                console.log('✅ Health Connect permissions granted');
            }
            return granted;
        } catch (e) {
            console.error('Health Connect permission error:', e);
            return false;
        }
    }

    return false;
}

/**
 * Fetch health data from the device
 */
export async function fetchHealthData(): Promise<HealthData | null> {
    console.log(`🔍 [HealthService] fetchHealthData() | Platform: ${Platform.OS}`);

    // Check if mock data mode is enabled
    const useMock = await isUsingMockHealthData();
    if (useMock) {
        console.log('🧪 Using mock health data');
        return generateMockHealthData();
    }

    // Android: Try Google Fit
    if (Platform.OS === 'android') {
        const gfEnabled = await isGoogleFitEnabled();
        if (gfEnabled && isGoogleFitAvailable()) {
            console.log('📱 [Android] Fetching from Google Fit...');
            const data = await fetchGoogleFitData();
            if (data && Object.keys(data).length > 0) return data;
        }
    }

    // iOS: Try Google Fit REST API
    if (Platform.OS === 'ios') {
        const gfIOSEnabled = await isGoogleFitIOSEnabled();
        console.log(`📱 [iOS] Google Fit enabled: ${gfIOSEnabled}`);
        if (gfIOSEnabled) {
            const data = await fetchGoogleFitIOSData();
            if (data && Object.keys(data).length > 0) {
                console.log('✅ [iOS] Using Google Fit data');
                return data;
            }
            console.log('⚠️ [iOS] Google Fit returned no data, trying Apple Health...');
        }
    }

    if (!isHealthSupported()) {
        console.log('❌ Health features not available');
        return null;
    } const { startDate, endDate } = getYesterdayDateRange();
    const healthData: HealthData = {};

    if (Platform.OS === 'ios' && AppleHealthKit) {
        try {
            // Fetch sleep data
            const sleepData = await new Promise<unknown>((resolve) => {
                AppleHealthKit!.getSleepSamples(
                    {
                        startDate: startDate.toISOString(),
                        endDate: endDate.toISOString(),
                    },
                    (err: unknown, results: unknown) => {
                        if (err) {
                            console.error('Sleep fetch error:', err);
                            resolve(null);
                        } else {
                            resolve(results);
                        }
                    }
                );
            });

            if (Array.isArray(sleepData) && sleepData.length > 0) {
                // Calculate total sleep duration
                let totalMinutes = 0;
                for (const sample of sleepData) {
                    if (sample.value === 'ASLEEP' || sample.value === 'INBED') {
                        const start = new Date(sample.startDate);
                        const end = new Date(sample.endDate);
                        totalMinutes += (end.getTime() - start.getTime()) / (1000 * 60);
                    }
                }
                healthData.sleepDuration = Math.round(totalMinutes / 60 * 10) / 10;
            }

            // Fetch steps
            const stepsData = await new Promise<unknown>((resolve) => {
                AppleHealthKit!.getStepCount(
                    {
                        startDate: startDate.toISOString(),
                        endDate: endDate.toISOString(),
                    },
                    (err: unknown, results: unknown) => {
                        if (err) {
                            console.error('Steps fetch error:', err);
                            resolve(null);
                        } else {
                            resolve(results);
                        }
                    }
                );
            });

            if (stepsData && typeof stepsData === 'object' && 'value' in stepsData) {
                healthData.steps = Math.round((stepsData as { value: number }).value);
            }

            // Fetch HRV
            const hrvData = await new Promise<unknown>((resolve) => {
                AppleHealthKit!.getHeartRateVariabilitySamples(
                    {
                        startDate: startDate.toISOString(),
                        endDate: endDate.toISOString(),
                    },
                    (err: unknown, results: unknown) => {
                        if (err) {
                            console.error('HRV fetch error:', err);
                            resolve(null);
                        } else {
                            resolve(results);
                        }
                    }
                );
            });

            if (Array.isArray(hrvData) && hrvData.length > 0) {
                // Get the most recent HRV value
                const latestHrv = hrvData[hrvData.length - 1];
                healthData.hrv = Math.round(latestHrv.value);
            }

            // Fetch Resting Heart Rate
            const restingHrData = await new Promise<unknown>((resolve) => {
                AppleHealthKit!.getRestingHeartRate(
                    {
                        startDate: startDate.toISOString(),
                        endDate: endDate.toISOString(),
                    },
                    (err: unknown, results: unknown) => {
                        if (err) {
                            console.error('Resting HR fetch error:', err);
                            resolve(null);
                        } else {
                            resolve(results);
                        }
                    }
                );
            });

            if (restingHrData && typeof restingHrData === 'object' && 'value' in restingHrData) {
                healthData.restingHeartRate = Math.round((restingHrData as { value: number }).value);
            }

            // Fetch Active Energy Burned
            const activeEnergyData = await new Promise<unknown>((resolve) => {
                AppleHealthKit!.getActiveEnergyBurned(
                    {
                        startDate: startDate.toISOString(),
                        endDate: endDate.toISOString(),
                    },
                    (err: unknown, results: unknown) => {
                        if (err) {
                            console.error('Active energy fetch error:', err);
                            resolve(null);
                        } else {
                            resolve(results);
                        }
                    }
                );
            });

            if (Array.isArray(activeEnergyData) && activeEnergyData.length > 0) {
                healthData.activeCalories = Math.round(
                    activeEnergyData.reduce((sum: number, s: { value: number }) => sum + s.value, 0)
                );
            }

            console.log('📊 iOS Health data fetched:', healthData);
        } catch (e) {
            console.error('iOS health data fetch error:', e);
        }
    }

    if (Platform.OS === 'android' && HealthConnect) {
        try {
            await HealthConnect.initialize();

            // Fetch sleep data
            const sleepResult = await HealthConnect.readRecords('SleepSession', {
                timeRangeFilter: {
                    operator: 'between',
                    startTime: startDate.toISOString(),
                    endTime: endDate.toISOString(),
                },
            });

            if (sleepResult.records && sleepResult.records.length > 0) {
                // Calculate total sleep duration
                let totalMinutes = 0;
                for (const session of sleepResult.records) {
                    const start = new Date(session.startTime);
                    const end = new Date(session.endTime);
                    totalMinutes += (end.getTime() - start.getTime()) / (1000 * 60);
                }
                healthData.sleepDuration = Math.round(totalMinutes / 60 * 10) / 10;
            }

            // Fetch steps
            const stepsResult = await HealthConnect.readRecords('Steps', {
                timeRangeFilter: {
                    operator: 'between',
                    startTime: startDate.toISOString(),
                    endTime: endDate.toISOString(),
                },
            });

            if (stepsResult.records && stepsResult.records.length > 0) {
                healthData.steps = stepsResult.records.reduce(
                    (sum: number, r: { count: number }) => sum + r.count, 0
                );
            }

            // Fetch HRV
            const hrvResult = await HealthConnect.readRecords('HeartRateVariabilityRmssd', {
                timeRangeFilter: {
                    operator: 'between',
                    startTime: startDate.toISOString(),
                    endTime: endDate.toISOString(),
                },
            });

            if (hrvResult.records && hrvResult.records.length > 0) {
                const latestHrv = hrvResult.records[hrvResult.records.length - 1];
                healthData.hrv = Math.round(latestHrv.heartRateVariabilityMillis);
            }

            // Fetch Resting Heart Rate
            const restingHrResult = await HealthConnect.readRecords('RestingHeartRate', {
                timeRangeFilter: {
                    operator: 'between',
                    startTime: startDate.toISOString(),
                    endTime: endDate.toISOString(),
                },
            });

            if (restingHrResult.records && restingHrResult.records.length > 0) {
                const latestRhr = restingHrResult.records[restingHrResult.records.length - 1];
                healthData.restingHeartRate = Math.round(latestRhr.beatsPerMinute);
            }

            // Fetch Active Calories Burned
            const caloriesResult = await HealthConnect.readRecords('ActiveCaloriesBurned', {
                timeRangeFilter: {
                    operator: 'between',
                    startTime: startDate.toISOString(),
                    endTime: endDate.toISOString(),
                },
            });

            if (caloriesResult.records && caloriesResult.records.length > 0) {
                healthData.activeCalories = Math.round(
                    caloriesResult.records.reduce(
                        (sum: number, r: { energy: { inKilocalories: number } }) =>
                            sum + r.energy.inKilocalories, 0
                    )
                );
            }

            console.log('📊 Android Health data fetched:', healthData);
        } catch (e) {
            console.error('Android health data fetch error:', e);
        }
    }

    return Object.keys(healthData).length > 0 ? healthData : null;
}

/**
 * Sync health data to Supabase
 */
export async function syncHealthData(): Promise<boolean> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            console.log('No user logged in, skipping health sync');
            return false;
        }

        const healthData = await fetchHealthData();
        if (!healthData) {
            console.log('No health data to sync');
            return false;
        }

        const sourceDate = new Date();
        sourceDate.setDate(sourceDate.getDate() - 1);
        const sourceDateStr = sourceDate.toISOString().split('T')[0];

        console.log('📤 [HealthService] Saving to DB for date:', sourceDateStr);

        // Save sleep data (includes all vitals in the data JSON)
        await supabase.from('health_data').upsert({
            user_id: user.id,
            type: 'sleep',
            data: {
                duration_hours: healthData.sleepDuration ?? null,
                quality: healthData.sleepQuality ?? null,
                restingHeartRate: healthData.restingHeartRate ?? null,
                hrv: healthData.hrv ?? null,
                activeCalories: healthData.activeCalories ?? null,
            },
            source_date: sourceDateStr,
        }, { onConflict: 'user_id,type,source_date' });

        // Save steps data
        if (healthData.steps !== undefined) {
            await supabase.from('health_data').upsert({
                user_id: user.id,
                type: 'steps',
                data: {
                    count: healthData.steps,
                    activeCalories: healthData.activeCalories ?? null,
                },
                source_date: sourceDateStr,
            }, { onConflict: 'user_id,type,source_date' });
        }

        // Save last sync time
        await AsyncStorage.setItem(HEALTH_LAST_SYNC_KEY, new Date().toISOString());

        console.log('✅ Health data synced to Supabase');
        return true;
    } catch (e) {
        console.error('Health data sync error:', e);
        return false;
    }
}

/**
 * Sync week's health data from Google Fit iOS to Supabase
 * Fetches 7 days of data and stores each day
 */
export async function syncWeekHealthData(): Promise<boolean> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            console.log('No user logged in, skipping week sync');
            return false;
        }

        console.log('🔄 [HealthService] Syncing week data...');

        // Only works for iOS Google Fit for now
        if (Platform.OS !== 'ios') {
            console.log('Week sync only available for iOS Google Fit');
            return await syncHealthData(); // Fallback to single day
        }

        const gfEnabled = await isGoogleFitIOSEnabled();
        if (!gfEnabled) {
            console.log('Google Fit not enabled, using single day sync');
            return await syncHealthData();
        }

        const weekData = await fetchGoogleFitIOSWeekData();
        if (weekData.length === 0) {
            console.log('No week data received');
            return false;
        }

        let syncedDays = 0;
        for (const dayData of weekData) {
            // Skip days with no data at all
            if (dayData.steps === null && dayData.activeCalories === null &&
                dayData.restingHeartRate === null && dayData.sleepDuration === null) {
                continue;
            }

            console.log(`📤 Saving day ${dayData.date}: steps=${dayData.steps}, sleep=${dayData.sleepDuration}h`);

            // Save sleep record with all vitals
            await supabase.from('health_data').upsert({
                user_id: user.id,
                type: 'sleep',
                data: {
                    duration_hours: dayData.sleepDuration,
                    quality: dayData.sleepQuality,
                    restingHeartRate: dayData.restingHeartRate,
                    hrv: dayData.hrv,
                    activeCalories: dayData.activeCalories,
                },
                source_date: dayData.date,
            }, { onConflict: 'user_id,type,source_date' });

            // Save steps record
            if (dayData.steps !== null) {
                await supabase.from('health_data').upsert({
                    user_id: user.id,
                    type: 'steps',
                    data: {
                        count: dayData.steps,
                        activeCalories: dayData.activeCalories,
                    },
                    source_date: dayData.date,
                }, { onConflict: 'user_id,type,source_date' });
            }

            syncedDays++;
        }

        await AsyncStorage.setItem(HEALTH_LAST_SYNC_KEY, new Date().toISOString());
        console.log(`✅ Week sync complete: ${syncedDays} days synced`);
        return syncedDays > 0;
    } catch (e) {
        console.error('Week health sync error:', e);
        return false;
    }
}

/**
 * Get the last sync time
 */
export async function getLastSyncTime(): Promise<Date | null> {
    try {
        const lastSync = await AsyncStorage.getItem(HEALTH_LAST_SYNC_KEY);
        return lastSync ? new Date(lastSync) : null;
    } catch {
        return null;
    }
}

/**
 * Format last sync time for display
 */
export function formatLastSync(date: Date | null): string {
    if (!date) return 'Never synced';

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minutes ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    return date.toLocaleDateString();
}
