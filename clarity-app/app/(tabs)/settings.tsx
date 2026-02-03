import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Switch,
    Alert,
    ActivityIndicator,
    Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/hooks/useAuth';
import Colors from '@/constants/Colors';
import {
    getNotificationPreferences,
    saveNotificationPreferences,
    sendTestNotification,
    areNotificationsSupported,
    NotificationPreferences,
} from '@/lib/notificationService';
import {
    isHealthSupported,
    getHealthPlatformName,
    requestHealthPermissions,
    syncHealthData,
    syncWeekHealthData,
    getLastSyncTime,
    formatLastSync,
    setUseMockHealthData,
    isUsingMockHealthData,
    isGoogleFitAvailable,
    initializeGoogleFit,
    isGoogleFitEnabled,
} from '@/lib/healthService';
import {
    isCalendarSupported,
    isCalendarEnabled,
    requestCalendarPermissions,
    syncWeekCalendarData,
    getLastCalendarSyncTime,
    formatLastCalendarSync,
    isUsingMockCalendarData,
    setUseMockCalendarData,
} from '@/lib/calendarService';

export default function SettingsScreen() {
    const { user, signOut } = useAuth();
    const [notificationsEnabled, setNotificationsEnabled] = useState(true);
    const [loading, setLoading] = useState(true);

    // Health state
    const [healthConnected, setHealthConnected] = useState(false);
    const [lastHealthSync, setLastHealthSync] = useState<Date | null>(null);
    const [syncing, setSyncing] = useState(false);
    const [useMockData, setUseMockData] = useState(false);
    const [googleFitEnabled, setGoogleFitEnabled] = useState(false);
    const [googleFitAvailable, setGoogleFitAvailable] = useState(false);

    // Calendar state
    const [calendarConnected, setCalendarConnected] = useState(false);
    const [lastCalendarSync, setLastCalendarSync] = useState<Date | null>(null);
    const [calendarSyncing, setCalendarSyncing] = useState(false);
    const [useMockCalendar, setUseMockCalendar] = useState(false);

    // Load notification preferences on mount
    useEffect(() => {
        loadPreferences();
    }, []);

    const loadPreferences = async () => {
        const prefs = await getNotificationPreferences();
        setNotificationsEnabled(prefs.enabled);

        // Load health sync time
        const syncTime = await getLastSyncTime();
        setLastHealthSync(syncTime);
        setHealthConnected(syncTime !== null);

        // Load mock data preference
        const mockEnabled = await isUsingMockHealthData();
        setUseMockData(mockEnabled);

        // Load Google Fit preference
        setGoogleFitAvailable(isGoogleFitAvailable());
        const gfitEnabled = await isGoogleFitEnabled();
        setGoogleFitEnabled(gfitEnabled);

        // Load calendar preference
        const calEnabled = await isCalendarEnabled();
        setCalendarConnected(calEnabled);
        const calSyncTime = await getLastCalendarSyncTime();
        setLastCalendarSync(calSyncTime);
        
        // Load mock calendar preference
        const mockCalEnabled = await isUsingMockCalendarData();
        setUseMockCalendar(mockCalEnabled);

        setLoading(false);
    };

    const handleGoogleFitToggle = async (enabled: boolean) => {
        if (enabled) {
            const authorized = await initializeGoogleFit();
            if (authorized) {
                setGoogleFitEnabled(true);
                setHealthConnected(true);

                // Automatically fetch week's data after authorization
                console.log('🔄 Google Fit authorized, fetching week data...');
                Alert.alert(
                    '✅ Google Fit Connected',
                    'Fetching your health data for the last 7 days...',
                    [{ text: 'OK' }]
                );

                // Trigger week sync
                setSyncing(true);
                try {
                    const success = await syncWeekHealthData();
                    const syncTime = await getLastSyncTime();
                    setLastHealthSync(syncTime);

                    if (success) {
                        Alert.alert('Data Synced!', 'Your Google Fit health data for the last week has been imported. Check the Health tab to view your data.');
                    } else {
                        Alert.alert('No Data Found', 'Connected to Google Fit but no health data was found. Check console for details.');
                    }
                } catch (e) {
                    console.error('Error syncing week data:', e);
                    Alert.alert('Sync Error', 'Connected but failed to fetch data.');
                } finally {
                    setSyncing(false);
                }
            } else {
                Alert.alert(
                    'Authorization Failed',
                    'Could not connect to Google Fit. Please try again.',
                    [{ text: 'OK' }]
                );
            }
        } else {
            setGoogleFitEnabled(false);
            await AsyncStorage.setItem('@clarity_use_google_fit', 'false');
        }
    };

    const handleMockDataToggle = async (enabled: boolean) => {
        setUseMockData(enabled);
        await setUseMockHealthData(enabled);
        if (enabled) {
            Alert.alert(
                '🧪 Test Mode Enabled',
                'The app will use randomly generated health data for testing. This is useful when the simulator has no real health data.',
                [{ text: 'OK' }]
            );
        }
    };

    const handleNotificationsToggle = async (enabled: boolean) => {
        setNotificationsEnabled(enabled);

        const prefs = await getNotificationPreferences();
        await saveNotificationPreferences({ ...prefs, enabled });

        if (enabled) {
            Alert.alert(
                '🔔 Reminders Enabled',
                'You will receive check-in reminders at:\n\n• Morning: 8:00 AM\n• Mid-day: 1:00 PM\n• Evening: 8:00 PM',
                [
                    { text: 'OK' },
                    {
                        text: 'Test Now',
                        onPress: () => sendTestNotification()
                    }
                ]
            );
        }
    };

    const handleTestNotification = async () => {
        await sendTestNotification();
        Alert.alert('Sent!', 'Check your notifications bar.');
    };

    const handleHealthSync = async () => {
        setSyncing(true);
        try {
            const success = await syncWeekHealthData();
            if (success) {
                const syncTime = await getLastSyncTime();
                setLastHealthSync(syncTime);
                Alert.alert('Synced!', 'Your health data for the last 7 days has been updated.');
            } else {
                Alert.alert('No Data', 'No health data found.');
            }
        } catch (e) {
            Alert.alert('Error', 'Failed to sync health data. Please try again.');
        } finally {
            setSyncing(false);
        }
    };

    const handleSignOut = () => {
        Alert.alert(
            'Sign Out',
            'Are you sure you want to sign out?',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Sign Out', style: 'destructive', onPress: signOut },
            ]
        );
    };

    const handleCalendarToggle = async () => {
        if (!calendarConnected) {
            const granted = await requestCalendarPermissions();
            if (granted) {
                setCalendarConnected(true);
                Alert.alert(
                    '📅 Calendar Connected',
                    'Fetching your calendar data for the last 7 days...',
                    [{ text: 'OK' }]
                );
                handleCalendarSync();
            } else {
                Alert.alert(
                    'Permission Required',
                    'Please grant calendar permissions to track cognitive load from meetings.',
                    [{ text: 'OK' }]
                );
            }
        }
    };

    const handleCalendarSync = async () => {
        setCalendarSyncing(true);
        try {
            const success = await syncWeekCalendarData();
            if (success) {
                const syncTime = await getLastCalendarSyncTime();
                setLastCalendarSync(syncTime);
                Alert.alert('Synced!', 'Your calendar data for the last 7 days has been updated.');
            } else {
                Alert.alert('No Data', 'Could not sync calendar data. Please check permissions.');
            }
        } catch (e) {
            console.error('Calendar sync error:', e);
            Alert.alert('Error', 'Failed to sync calendar data.');
        } finally {
            setCalendarSyncing(false);
        }
    };

    const handleMockCalendarToggle = async (enabled: boolean) => {
        setUseMockCalendar(enabled);
        await setUseMockCalendarData(enabled);
        if (enabled) {
            setCalendarConnected(true);
            Alert.alert(
                '🧪 Test Mode Enabled',
                'The app will use randomly generated calendar data for testing. This is useful when no real calendar is available.',
                [{ text: 'OK' }]
            );
            // Auto-sync mock data
            handleCalendarSync();
        }
    };

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <View style={styles.header}>
                <Text style={styles.title}>Settings</Text>
            </View>

            {/* Account Section */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Account</Text>
                <View style={styles.card}>
                    <View style={styles.row}>
                        <Text style={styles.label}>Email</Text>
                        <Text style={styles.value}>{user?.email || 'Not logged in'}</Text>
                    </View>
                </View>
            </View>

            {/* Notifications Section */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Check-In Reminders</Text>
                <View style={styles.card}>
                    {areNotificationsSupported() ? (
                        <>
                            <View style={styles.switchRow}>
                                <View>
                                    <Text style={styles.label}>Enable Reminders</Text>
                                    <Text style={styles.hint}>Get notified for each check-in</Text>
                                </View>
                                <Switch
                                    value={notificationsEnabled}
                                    onValueChange={handleNotificationsToggle}
                                    trackColor={{ false: Colors.neutral[300], true: Colors.primary[400] }}
                                    thumbColor="#fff"
                                    disabled={loading}
                                />
                            </View>

                            {notificationsEnabled && (
                                <>
                                    <View style={styles.divider} />
                                    <View style={styles.scheduleRow}>
                                        <Text style={styles.scheduleLabel}>🌅 Morning Check-In</Text>
                                        <Text style={styles.scheduleTime}>8:00 AM</Text>
                                    </View>
                                    <View style={styles.scheduleRow}>
                                        <Text style={styles.scheduleLabel}>☀️ Mid-Day Pulse</Text>
                                        <Text style={styles.scheduleTime}>1:00 PM</Text>
                                    </View>
                                    <View style={styles.scheduleRow}>
                                        <Text style={styles.scheduleLabel}>🌙 Evening Reflection</Text>
                                        <Text style={styles.scheduleTime}>8:00 PM</Text>
                                    </View>
                                    <View style={styles.divider} />
                                    <TouchableOpacity
                                        style={styles.testRow}
                                        onPress={handleTestNotification}
                                    >
                                        <Text style={styles.testLabel}>Send Test Notification</Text>
                                        <Text style={styles.arrow}>→</Text>
                                    </TouchableOpacity>
                                </>
                            )}
                        </>
                    ) : (
                        <View style={styles.expoGoWarning}>
                            <Text style={styles.warningEmoji}>📱</Text>
                            <Text style={styles.warningTitle}>Not Available in Expo Go</Text>
                            <Text style={styles.warningText}>
                                Notifications require a development build. The app will still work, but you won't receive reminders.
                            </Text>
                        </View>
                    )}
                </View>
            </View>

            {/* Health Data Section */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>{getHealthPlatformName()}</Text>
                <View style={styles.card}>
                    <View style={styles.switchRow}>
                        <View>
                            <Text style={styles.label}>🧪 Use Test Data</Text>
                            <Text style={styles.hint}>Simulate health data (works in Expo Go)</Text>
                        </View>
                        <Switch
                            value={useMockData}
                            onValueChange={handleMockDataToggle}
                            trackColor={{ false: Colors.neutral[300], true: Colors.primary[400] }}
                            thumbColor="#fff"
                        />
                    </View>

                    {/* Google Fit Toggle - Available on both iOS and Android */}
                    {googleFitAvailable && (
                        <>
                            <View style={styles.divider} />
                            <View style={styles.switchRow}>
                                <View>
                                    <Text style={styles.label}>📊 Use Google Fit</Text>
                                    <Text style={styles.hint}>
                                        {Platform.OS === 'ios'
                                            ? 'Fetch data from Google Fit instead of Apple Health'
                                            : 'Fetch data from Google Fit instead of Health Connect'}
                                    </Text>
                                </View>
                                <Switch
                                    value={googleFitEnabled}
                                    onValueChange={handleGoogleFitToggle}
                                    trackColor={{ false: Colors.neutral[300], true: Colors.primary[400] }}
                                    thumbColor="#fff"
                                />
                            </View>
                        </>
                    )}

                    <View style={styles.divider} />

                    {isHealthSupported() || useMockData ? (
                        <>
                            <View style={styles.row}>
                                <View>
                                    <Text style={styles.label}>Connection Status</Text>
                                    <Text style={styles.hint}>
                                        {healthConnected ? 'Connected' : 'Not connected'}
                                    </Text>
                                </View>
                                <View style={[
                                    styles.statusBadge,
                                    healthConnected ? styles.statusConnected : styles.statusDisconnected
                                ]}>
                                    <Text style={styles.statusText}>
                                        {healthConnected ? '●' : '○'}
                                    </Text>
                                </View>
                            </View>

                            {healthConnected && (
                                <>
                                    <View style={styles.divider} />
                                    <View style={styles.row}>
                                        <Text style={styles.label}>Last Synced</Text>
                                        <Text style={styles.value}>{formatLastSync(lastHealthSync)}</Text>
                                    </View>
                                </>
                            )}

                            <View style={styles.divider} />
                            <TouchableOpacity
                                style={styles.actionRow}
                                onPress={async () => {
                                    if (!healthConnected) {
                                        const granted = await requestHealthPermissions();
                                        if (granted) {
                                            setHealthConnected(true);
                                            Alert.alert('Connected!', `${getHealthPlatformName()} is now connected.`);
                                            handleHealthSync();
                                        } else {
                                            Alert.alert('Permission Required', `Please grant ${getHealthPlatformName()} permissions to enable health data sync.`);
                                        }
                                    } else {
                                        handleHealthSync();
                                    }
                                }}
                                disabled={syncing}
                            >
                                {syncing ? (
                                    <ActivityIndicator size="small" color={Colors.primary[600]} />
                                ) : (
                                    <>
                                        <Text style={styles.actionLabel}>
                                            {healthConnected ? 'Sync Now' : 'Connect'}
                                        </Text>
                                        <Text style={styles.arrow}>→</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </>
                    ) : (
                        <View style={styles.expoGoWarning}>
                            <Text style={styles.warningEmoji}>📱</Text>
                            <Text style={styles.warningTitle}>Not Available in Expo Go</Text>
                            <Text style={styles.warningText}>
                                Real health data requires a development build. Enable "Test Data" above to simulate.
                            </Text>
                        </View>
                    )}
                </View>
            </View>

            {/* Calendar Integration Section */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>📅 Calendar & Cognitive Load</Text>
                <View style={styles.card}>
                    {isCalendarSupported() ? (
                        <>
                            <View style={styles.row}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.label}>Calendar Access</Text>
                                    <Text style={styles.hint}>
                                        Track meeting density to explain energy dips
                                    </Text>
                                </View>
                                <View style={[
                                    styles.statusBadge,
                                    calendarConnected ? styles.statusConnected : styles.statusDisconnected
                                ]}>
                                    <Text style={styles.statusText}>
                                        {calendarConnected ? '●' : '○'}
                                    </Text>
                                </View>
                            </View>

                            {calendarConnected && lastCalendarSync && (
                                <>
                                    <View style={styles.divider} />
                                    <View style={styles.row}>
                                        <Text style={styles.label}>Last Synced</Text>
                                        <Text style={styles.value}>{formatLastCalendarSync(lastCalendarSync)}</Text>
                                    </View>
                                </>
                            )}

                            <View style={styles.divider} />
                            <TouchableOpacity
                                style={styles.actionRow}
                                onPress={calendarConnected ? handleCalendarSync : handleCalendarToggle}
                                disabled={calendarSyncing}
                            >
                                {calendarSyncing ? (
                                    <ActivityIndicator size="small" color={Colors.primary[600]} />
                                ) : (
                                    <>
                                        <Text style={styles.actionLabel}>
                                            {calendarConnected ? 'Sync Now' : 'Connect Calendar'}
                                        </Text>
                                        <Text style={styles.arrow}>→</Text>
                                    </>
                                )}
                            </TouchableOpacity>

                            <View style={styles.divider} />
                            <View style={styles.privacyNote}>
                                <Text style={styles.privacyText}>
                                    🔒 Privacy: We only access meeting times, never titles or attendees.
                                </Text>
                            </View>
                            
                            <View style={styles.divider} />
                            <View style={styles.row}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.label}>🧪 Use Test Data</Text>
                                    <Text style={styles.hint}>Use mock data instead of real calendar</Text>
                                </View>
                                <Switch
                                    value={useMockCalendar}
                                    onValueChange={handleMockCalendarToggle}
                                    trackColor={{ false: '#E0E0E0', true: Colors.primary[400] }}
                                    thumbColor={useMockCalendar ? Colors.primary[600] : '#f4f3f4'}
                                />
                            </View>
                        </>
                    ) : (
                        <>
                            <View style={styles.expoGoWarning}>
                                <Text style={styles.warningEmoji}>📱</Text>
                                <Text style={styles.warningTitle}>Not Available in Expo Go</Text>
                                <Text style={styles.warningText}>
                                    Calendar access requires a development build.
                                </Text>
                            </View>
                            <View style={styles.divider} />
                            <View style={styles.row}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.label}>🧪 Use Test Data</Text>
                                    <Text style={styles.hint}>Generate mock calendar data for testing</Text>
                                </View>
                                <Switch
                                    value={useMockCalendar}
                                    onValueChange={handleMockCalendarToggle}
                                    trackColor={{ false: '#E0E0E0', true: Colors.primary[400] }}
                                    thumbColor={useMockCalendar ? Colors.primary[600] : '#f4f3f4'}
                                />
                            </View>
                        </>
                    )}
                </View>
            </View>

            {/* Data & Privacy Section */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Data & Privacy</Text>
                <View style={styles.card}>
                    <TouchableOpacity style={styles.linkRow}>
                        <Text style={styles.label}>Export My Data</Text>
                        <Text style={styles.arrow}>→</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* About Section */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>About</Text>
                <View style={styles.card}>
                    <View style={styles.row}>
                        <Text style={styles.label}>Version</Text>
                        <Text style={styles.value}>1.0.0</Text>
                    </View>
                    <View style={styles.divider} />
                    <TouchableOpacity style={styles.linkRow}>
                        <Text style={styles.label}>Privacy Policy</Text>
                        <Text style={styles.arrow}>→</Text>
                    </TouchableOpacity>
                    <View style={styles.divider} />
                    <TouchableOpacity style={styles.linkRow}>
                        <Text style={styles.label}>Terms of Service</Text>
                        <Text style={styles.arrow}>→</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Sign Out Button */}
            <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
                <Text style={styles.signOutText}>Sign Out</Text>
            </TouchableOpacity>

            <View style={styles.footer} />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background.primary,
    },
    content: {
        padding: 20,
        paddingTop: 60,
    },
    header: {
        marginBottom: 24,
    },
    title: {
        fontSize: 28,
        fontWeight: '800',
        color: Colors.text.primary,
        letterSpacing: -0.5,
    },
    section: {
        marginBottom: 28,
    },
    sectionTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: Colors.text.secondary,
        marginBottom: 12,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
    },
    card: {
        backgroundColor: '#fff',
        borderRadius: 18,
        overflow: 'hidden',
        shadowColor: Colors.neutral[900],
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
        elevation: 2,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 18,
    },
    switchRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 18,
    },
    linkRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 18,
    },
    scheduleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 18,
        paddingVertical: 14,
        backgroundColor: Colors.primary[50],
    },
    scheduleLabel: {
        fontSize: 15,
        color: Colors.text.primary,
        fontWeight: '500',
    },
    scheduleTime: {
        fontSize: 15,
        fontWeight: '700',
        color: Colors.primary[600],
    },
    testRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 18,
    },
    testLabel: {
        fontSize: 15,
        color: Colors.primary[600],
        fontWeight: '600',
    },
    label: {
        fontSize: 16,
        color: Colors.text.primary,
        fontWeight: '500',
    },
    value: {
        fontSize: 15,
        color: Colors.text.secondary,
        fontWeight: '500',
    },
    hint: {
        fontSize: 13,
        color: Colors.text.tertiary,
        marginTop: 4,
        fontWeight: '500',
    },
    arrow: {
        fontSize: 18,
        color: Colors.text.tertiary,
        fontWeight: '600',
    },
    divider: {
        height: 1,
        backgroundColor: Colors.neutral[100],
        marginLeft: 18,
    },
    signOutButton: {
        backgroundColor: Colors.error[50],
        borderRadius: 16,
        padding: 18,
        alignItems: 'center',
        marginTop: 8,
        borderWidth: 1,
        borderColor: Colors.error[100],
    },
    signOutText: {
        fontSize: 16,
        fontWeight: '700',
        color: Colors.error[600],
    },
    footer: {
        height: 40,
    },
    expoGoWarning: {
        padding: 24,
        alignItems: 'center',
    },
    warningEmoji: {
        fontSize: 36,
        marginBottom: 14,
    },
    warningTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: Colors.text.primary,
        marginBottom: 8,
    },
    warningText: {
        fontSize: 14,
        color: Colors.text.secondary,
        textAlign: 'center',
        lineHeight: 22,
        fontWeight: '500',
    },
    statusBadge: {
        width: 32,
        height: 32,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    statusConnected: {
        backgroundColor: Colors.success[100],
    },
    statusDisconnected: {
        backgroundColor: Colors.neutral[100],
    },
    statusText: {
        fontSize: 18,
    },
    actionRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 18,
    },
    actionLabel: {
        fontSize: 15,
        fontWeight: '700',
        color: Colors.primary[600],
    },
    privacyNote: {
        padding: 14,
        backgroundColor: Colors.primary[50],
    },
    privacyText: {
        fontSize: 12,
        color: Colors.text.secondary,
        textAlign: 'center',
        fontWeight: '500',
    },
});
