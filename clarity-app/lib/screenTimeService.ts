/**
 * Screen Time Service
 * 
 * Fetches screen time data from device APIs:
 * - iOS: Screen Time API (requires DeviceActivity framework in native module)
 * - Android: Digital Wellbeing / UsageStats API
 * 
 * Note: Full native implementation requires:
 * - iOS: Creating a native module with DeviceActivity framework access
 * - Android: UsageStatsManager permission and native module
 * 
 * For MVP, this provides a fallback structure that can be extended
 * with native modules or third-party libraries like react-native-device-activity
 */

import { Platform, NativeModules } from 'react-native';
import { supabase } from './supabase';

// Types for screen time data
export interface ScreenTimeData {
    totalMinutes: number;
    socialMediaMinutes: number;
    beforeBedMinutes: number; // Screen use within 1 hour of bedtime
    pickups: number;
    notifications: number;
    appUsage: AppUsage[];
    source: 'device' | 'manual' | 'estimated';
    date: string;
}

export interface AppUsage {
    appName: string;
    category: string;
    minutes: number;
}

// Bedtime configuration (could come from user settings)
const DEFAULT_BEDTIME_HOUR = 22; // 10 PM

/**
 * Check if screen time APIs are available on this device
 */
export function isScreenTimeAvailable(): boolean {
    if (Platform.OS === 'ios') {
        // Check if native module for DeviceActivity is available
        return !!NativeModules.ScreenTimeModule;
    } else if (Platform.OS === 'android') {
        // Check if UsageStats native module is available
        return !!NativeModules.UsageStatsModule;
    }
    return false;
}

/**
 * Request permission to access screen time data
 * @returns true if permission granted
 */
export async function requestScreenTimePermission(): Promise<boolean> {
    try {
        if (Platform.OS === 'ios' && NativeModules.ScreenTimeModule) {
            return await NativeModules.ScreenTimeModule.requestAuthorization();
        } else if (Platform.OS === 'android' && NativeModules.UsageStatsModule) {
            return await NativeModules.UsageStatsModule.requestPermission();
        }
        return false;
    } catch (error) {
        console.log('Screen time permission not available:', error);
        return false;
    }
}

/**
 * Check if screen time permission is granted
 */
export async function hasScreenTimePermission(): Promise<boolean> {
    try {
        if (Platform.OS === 'ios' && NativeModules.ScreenTimeModule) {
            return await NativeModules.ScreenTimeModule.hasAuthorization();
        } else if (Platform.OS === 'android' && NativeModules.UsageStatsModule) {
            return await NativeModules.UsageStatsModule.hasPermission();
        }
        return false;
    } catch {
        return false;
    }
}

/**
 * Fetch screen time data for a specific date
 * @param date - Date string in YYYY-MM-DD format (defaults to today)
 */
export async function getScreenTimeData(date?: string): Promise<ScreenTimeData | null> {
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    try {
        // Try to get data from native module
        if (Platform.OS === 'ios' && NativeModules.ScreenTimeModule) {
            const nativeData = await NativeModules.ScreenTimeModule.getScreenTime(targetDate);
            return parseIOSScreenTime(nativeData, targetDate);
        } else if (Platform.OS === 'android' && NativeModules.UsageStatsModule) {
            const nativeData = await NativeModules.UsageStatsModule.getUsageStats(targetDate);
            return parseAndroidUsageStats(nativeData, targetDate);
        }
        
        // Fallback: Return null if no native module available
        console.log('Screen time native module not available');
        return null;
    } catch (error) {
        console.error('Error fetching screen time:', error);
        return null;
    }
}

/**
 * Get screen time specifically for the hour before bedtime
 * This is used to determine screen_before_bed
 */
export async function getBeforeBedScreenTime(
    date?: string,
    bedtimeHour: number = DEFAULT_BEDTIME_HOUR
): Promise<{ used: boolean; minutes: number } | null> {
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    try {
        if (Platform.OS === 'ios' && NativeModules.ScreenTimeModule) {
            // Get screen time for 1 hour before bedtime
            const data = await NativeModules.ScreenTimeModule.getScreenTimeForHour(
                targetDate,
                bedtimeHour - 1, // 1 hour before bedtime
                bedtimeHour
            );
            return {
                used: data.minutes > 5, // More than 5 minutes = used
                minutes: data.minutes,
            };
        } else if (Platform.OS === 'android' && NativeModules.UsageStatsModule) {
            const data = await NativeModules.UsageStatsModule.getUsageForTimeRange(
                targetDate,
                `${bedtimeHour - 1}:00`,
                `${bedtimeHour}:00`
            );
            return {
                used: data.minutes > 5,
                minutes: data.minutes,
            };
        }
        return null;
    } catch (error) {
        console.error('Error fetching before-bed screen time:', error);
        return null;
    }
}

/**
 * Sync today's screen time data to the backend
 * This should be called periodically (e.g., in evening check-in)
 */
export async function syncScreenTimeToBackend(): Promise<boolean> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            console.log('No user logged in for screen time sync');
            return false;
        }
        
        const today = new Date().toISOString().split('T')[0];
        const screenTimeData = await getScreenTimeData(today);
        
        if (!screenTimeData) {
            console.log('No screen time data available');
            return false;
        }
        
        // Get before-bed screen time
        const beforeBed = await getBeforeBedScreenTime(today);
        
        // Update daily_habits with screen time data
        const { error } = await supabase
            .from('daily_habits')
            .upsert({
                user_id: user.id,
                date: today,
                screen_time_hours: screenTimeData.totalMinutes / 60,
                social_media_hours: screenTimeData.socialMediaMinutes / 60,
                screen_before_bed: beforeBed?.used ?? null,
                screen_before_bed_minutes: beforeBed?.minutes ?? null,
                screen_time_source: 'device',
            }, {
                onConflict: 'user_id,date',
            });
        
        if (error) {
            console.error('Error syncing screen time:', error);
            return false;
        }
        
        console.log('✅ Screen time synced successfully');
        return true;
    } catch (error) {
        console.error('Error syncing screen time:', error);
        return false;
    }
}

/**
 * Parse iOS Screen Time data from native module
 */
function parseIOSScreenTime(nativeData: any, date: string): ScreenTimeData {
    return {
        totalMinutes: nativeData.totalScreenTime || 0,
        socialMediaMinutes: nativeData.socialMediaTime || 0,
        beforeBedMinutes: nativeData.beforeBedTime || 0,
        pickups: nativeData.pickups || 0,
        notifications: nativeData.notifications || 0,
        appUsage: (nativeData.appUsage || []).map((app: any) => ({
            appName: app.name,
            category: app.category,
            minutes: app.time,
        })),
        source: 'device',
        date,
    };
}

/**
 * Parse Android UsageStats data from native module
 */
function parseAndroidUsageStats(nativeData: any, date: string): ScreenTimeData {
    return {
        totalMinutes: nativeData.totalTimeInForeground || 0,
        socialMediaMinutes: nativeData.socialMediaTime || 0,
        beforeBedMinutes: nativeData.beforeBedTime || 0,
        pickups: nativeData.unlockCount || 0,
        notifications: nativeData.notificationCount || 0,
        appUsage: (nativeData.apps || []).map((app: any) => ({
            appName: app.packageName,
            category: app.category || 'Other',
            minutes: Math.round(app.totalTimeInForeground / 60000), // ms to minutes
        })),
        source: 'device',
        date,
    };
}

/**
 * Get a summary of screen time for display
 */
export function formatScreenTimeSummary(data: ScreenTimeData): string {
    const hours = Math.floor(data.totalMinutes / 60);
    const minutes = data.totalMinutes % 60;
    
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
}

/**
 * Determine if screen time is concerning based on thresholds
 */
export function analyzeScreenTime(data: ScreenTimeData): {
    level: 'low' | 'moderate' | 'high' | 'concerning';
    message: string;
} {
    const totalHours = data.totalMinutes / 60;
    
    if (totalHours < 2) {
        return { level: 'low', message: 'Great screen time balance!' };
    } else if (totalHours < 4) {
        return { level: 'moderate', message: 'Moderate screen usage today' };
    } else if (totalHours < 6) {
        return { level: 'high', message: 'Higher than average screen time' };
    } else {
        return { level: 'concerning', message: 'Consider reducing screen time' };
    }
}

/**
 * Check if user used phone before bed (affects sleep quality)
 */
export function hadScreenBeforeBed(data: ScreenTimeData): boolean {
    return data.beforeBedMinutes > 5; // More than 5 minutes counts
}
