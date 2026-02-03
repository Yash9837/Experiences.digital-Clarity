import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// Dynamically import notifications to avoid Expo Go crash
let Notifications: typeof import('expo-notifications') | null = null;
let Device: typeof import('expo-device') | null = null;

// Check if we're in Expo Go
const isExpoGo = Constants.appOwnership === 'expo';

// Only import if not in Expo Go
if (!isExpoGo) {
    try {
        Notifications = require('expo-notifications');
        Device = require('expo-device');

        // Configure notification behavior
        if (Notifications) {
            Notifications.setNotificationHandler({
                handleNotification: async () => ({
                    shouldShowAlert: true,
                    shouldPlaySound: true,
                    shouldSetBadge: false,
                    shouldShowBanner: true,
                    shouldShowList: true,
                }),
            });
        }
    } catch (e) {
        console.log('Notifications not available:', e);
    }
}

const NOTIFICATION_PREFS_KEY = '@clarity_notification_prefs';

export interface NotificationPreferences {
    enabled: boolean;
    morningTime: string; // HH:MM format
    middayTime: string;
    eveningTime: string;
}

const defaultPrefs: NotificationPreferences = {
    enabled: true,
    morningTime: '08:00',
    middayTime: '13:00',
    eveningTime: '20:00',
};

/**
 * Check if notifications are supported
 */
export function areNotificationsSupported(): boolean {
    return Notifications !== null && !isExpoGo;
}

/**
 * Request notification permissions
 */
export async function requestNotificationPermissions(): Promise<boolean> {
    if (!Notifications || !Device) {
        console.log('📱 Notifications not available in Expo Go');
        return false;
    }

    if (!Device.isDevice) {
        console.log('Notifications only work on physical devices');
        return false;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }

    if (finalStatus !== 'granted') {
        console.log('Notification permissions denied');
        return false;
    }

    // Required for Android
    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('check-in-reminders', {
            name: 'Check-in Reminders',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#4A90D9',
        });
    }

    console.log('✅ Notification permissions granted');
    return true;
}

/**
 * Get notification preferences
 */
export async function getNotificationPreferences(): Promise<NotificationPreferences> {
    try {
        const stored = await AsyncStorage.getItem(NOTIFICATION_PREFS_KEY);
        if (stored) {
            return { ...defaultPrefs, ...JSON.parse(stored) };
        }
        return defaultPrefs;
    } catch {
        return defaultPrefs;
    }
}

/**
 * Save notification preferences
 */
export async function saveNotificationPreferences(prefs: NotificationPreferences): Promise<void> {
    try {
        await AsyncStorage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(prefs));

        if (prefs.enabled && Notifications) {
            await scheduleCheckInReminders(prefs);
        } else if (Notifications) {
            await cancelAllNotifications();
        }
    } catch (err) {
        console.error('Error saving notification preferences:', err);
    }
}

/**
 * Parse time string to hours and minutes
 */
function parseTime(timeStr: string): { hours: number; minutes: number } {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return { hours, minutes };
}

/**
 * Schedule daily check-in reminders
 */
export async function scheduleCheckInReminders(prefs?: NotificationPreferences): Promise<void> {
    if (!Notifications) {
        console.log('📱 Skipping notification scheduling (not available)');
        return;
    }

    const preferences = prefs || await getNotificationPreferences();

    if (!preferences.enabled) {
        console.log('Notifications disabled, skipping scheduling');
        return;
    }

    // Cancel existing notifications first
    await cancelAllNotifications();

    const checkIns = [
        {
            id: 'morning',
            time: preferences.morningTime,
            title: '🌅 Good morning!',
            body: 'Time for your morning check-in. How rested do you feel?',
        },
        {
            id: 'midday',
            time: preferences.middayTime,
            title: '☀️ Mid-day check',
            body: "How's your energy? A quick check-in takes just 10 seconds.",
        },
        {
            id: 'evening',
            time: preferences.eveningTime,
            title: '🌙 Evening reflection',
            body: "Let's wrap up the day. What drained you most?",
        },
    ];

    for (const checkIn of checkIns) {
        const { hours, minutes } = parseTime(checkIn.time);

        try {
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: checkIn.title,
                    body: checkIn.body,
                    data: { type: checkIn.id },
                    sound: true,
                },
                trigger: {
                    type: Notifications.SchedulableTriggerInputTypes.DAILY,
                    hour: hours,
                    minute: minutes,
                },
            });

            console.log(`📅 Scheduled ${checkIn.id} reminder at ${checkIn.time}`);
        } catch (err) {
            console.error(`Error scheduling ${checkIn.id} notification:`, err);
        }
    }
}

/**
 * Cancel all scheduled notifications
 */
export async function cancelAllNotifications(): Promise<void> {
    if (!Notifications) return;
    await Notifications.cancelAllScheduledNotificationsAsync();
    console.log('🔕 Cancelled all scheduled notifications');
}

/**
 * Get all scheduled notifications (for debugging)
 */
export async function getScheduledNotifications() {
    if (!Notifications) return [];
    return await Notifications.getAllScheduledNotificationsAsync();
}

/**
 * Send an immediate test notification
 */
export async function sendTestNotification(): Promise<boolean> {
    if (!Notifications) {
        console.log('📱 Notifications not available in Expo Go');
        return false;
    }

    await Notifications.scheduleNotificationAsync({
        content: {
            title: '✨ Clarity is working!',
            body: 'Your check-in reminders are set up successfully.',
            data: { type: 'test' },
        },
        trigger: null, // Immediate
    });
    return true;
}

/**
 * Initialize notifications on app start
 */
export async function initializeNotifications(): Promise<void> {
    if (!Notifications) {
        console.log('📱 Skipping notification initialization (Expo Go)');
        return;
    }

    const hasPermission = await requestNotificationPermissions();

    if (hasPermission) {
        const prefs = await getNotificationPreferences();
        if (prefs.enabled) {
            await scheduleCheckInReminders(prefs);
        }
    }
}

/**
 * Add a notification response listener
 */
export function addNotificationResponseListener(
    callback: (response: { notification: { request: { content: { data: Record<string, unknown> } } } }) => void
) {
    if (!Notifications) {
        // Return a dummy subscription object
        return { remove: () => { } };
    }
    return Notifications.addNotificationResponseReceivedListener(callback);
}

/**
 * Add a notification received listener
 */
export function addNotificationReceivedListener(
    callback: (notification: unknown) => void
) {
    if (!Notifications) {
        return { remove: () => { } };
    }
    return Notifications.addNotificationReceivedListener(callback);
}

/**
 * Schedule a pattern reminder notification
 * Used for Discovery Moments "Set Reminder" feature
 */
export async function schedulePatternReminder(
    pattern: {
        title: string;
        emoji: string;
        type: 'drain' | 'booster' | 'insight';
    },
    reminderTime?: { hours: number; minutes: number }
): Promise<boolean> {
    if (!Notifications) {
        console.log('📱 Notifications not available in Expo Go');
        return false;
    }

    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) {
        return false;
    }

    // Default reminder times based on pattern type
    const defaultTimes = {
        drain: { hours: 14, minutes: 0 },  // 2 PM - afternoon check
        booster: { hours: 9, minutes: 0 }, // 9 AM - start of day
        insight: { hours: 12, minutes: 0 }, // Noon
    };

    const time = reminderTime || defaultTimes[pattern.type];

    const messages = {
        drain: {
            title: `${pattern.emoji} Avoid Energy Drain`,
            body: `Remember: ${pattern.title}. Stay aware of this pattern today!`,
        },
        booster: {
            title: `${pattern.emoji} Energy Boost Time!`,
            body: `Don't forget: ${pattern.title}. This energizes you!`,
        },
        insight: {
            title: `${pattern.emoji} Quick Reminder`,
            body: `${pattern.title}`,
        },
    };

    try {
        await Notifications.scheduleNotificationAsync({
            content: {
                title: messages[pattern.type].title,
                body: messages[pattern.type].body,
                data: { 
                    type: 'pattern-reminder',
                    patternType: pattern.type,
                },
                sound: true,
            },
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.DAILY,
                hour: time.hours,
                minute: time.minutes,
            },
        });

        console.log(`📅 Scheduled pattern reminder: "${pattern.title}" at ${time.hours}:${time.minutes.toString().padStart(2, '0')}`);
        return true;
    } catch (err) {
        console.error('Error scheduling pattern reminder:', err);
        return false;
    }
}

/**
 * Send immediate pattern reminder (for testing)
 */
export async function sendImmediatePatternReminder(
    pattern: {
        title: string;
        emoji: string;
        type: 'drain' | 'booster' | 'insight';
    }
): Promise<boolean> {
    if (!Notifications) {
        console.log('📱 Notifications not available');
        return false;
    }

    const messages = {
        drain: {
            title: `${pattern.emoji} Pattern Reminder Set!`,
            body: `We'll remind you about: ${pattern.title}`,
        },
        booster: {
            title: `${pattern.emoji} Reminder Saved!`,
            body: `We'll remind you to: ${pattern.title}`,
        },
        insight: {
            title: `${pattern.emoji} Got it!`,
            body: `Reminder set for: ${pattern.title}`,
        },
    };

    try {
        await Notifications.scheduleNotificationAsync({
            content: {
                title: messages[pattern.type].title,
                body: messages[pattern.type].body,
                data: { type: 'pattern-reminder-confirmation' },
                sound: true,
            },
            trigger: null, // Immediate
        });
        return true;
    } catch (err) {
        console.error('Error sending confirmation:', err);
        return false;
    }
}
