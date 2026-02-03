import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    RefreshControl,
    ActivityIndicator,
    TouchableOpacity,
    Dimensions,
    Alert,
    Platform,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import Colors from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import {
    isHealthSupported,
    getHealthPlatformName,
    requestHealthPermissions,
    fetchHealthData,
    syncHealthData,
    getLastSyncTime,
    formatLastSync,
    openHealthConnectSettings,
    checkHealthConnectAvailability,
    HealthData as DeviceHealthData,
} from '@/lib/healthService';

const { width: screenWidth } = Dimensions.get('window');

interface HealthMetrics {
    date: string;
    sleepDuration?: number;
    sleepQuality?: number;
    deepSleep?: number;
    remSleep?: number;
    steps?: number;
    distance?: number;
    activeCalories?: number;
    restingHeartRate?: number;
    hrv?: number;
    standingHours?: number;
    exerciseMinutes?: number;
    flightsClimbed?: number;
    bloodOxygen?: number;
    respiratoryRate?: number;
}

interface DayHealth {
    date: string;
    metrics: HealthMetrics;
}

export default function HealthScreen() {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [healthHistory, setHealthHistory] = useState<DayHealth[]>([]);
    const [selectedDay, setSelectedDay] = useState<number>(0);
    const [activeTab, setActiveTab] = useState<'overview' | 'sleep' | 'activity' | 'vitals'>('overview');
    const [healthConnected, setHealthConnected] = useState(false);
    const [lastSyncTime, setLastSyncTime] = useState<string>('Never');
    const [todayFromDevice, setTodayFromDevice] = useState<DeviceHealthData | null>(null);

    useFocusEffect(
        useCallback(() => {
            loadHealthData();
            checkHealthConnection();
        }, [])
    );

    const checkHealthConnection = async () => {
        if (isHealthSupported()) {
            const lastSync = await getLastSyncTime();
            setLastSyncTime(formatLastSync(lastSync));
            setHealthConnected(lastSync !== null);
        }
    };

    const connectHealth = async () => {
        if (!isHealthSupported()) {
            Alert.alert(
                'Not Available',
                `${getHealthPlatformName()} is not available on this device. Health data will be loaded from the database.`,
                [{ text: 'OK' }]
            );
            return;
        }

        // Check Health Connect availability on Android
        if (Platform.OS === 'android') {
            const { available, status } = await checkHealthConnectAvailability();
            if (!available) {
                if (status === 'not_installed') {
                    Alert.alert(
                        'Health Connect Required',
                        'Health Connect app is required. Please install it from the Google Play Store.',
                        [
                            { text: 'Cancel', style: 'cancel' },
                            {
                                text: 'Open Play Store', onPress: () => {
                                    // Open Health Connect on Play Store
                                    const { Linking } = require('react-native');
                                    Linking.openURL('https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata');
                                }
                            }
                        ]
                    );
                    return;
                } else if (status === 'update_required') {
                    Alert.alert(
                        'Update Required',
                        'Please update the Health Connect app to continue.',
                        [{ text: 'OK' }]
                    );
                    return;
                }
            }
        }

        setSyncing(true);
        try {
            const granted = await requestHealthPermissions();
            if (granted) {
                const synced = await syncHealthData();
                if (synced) {
                    setHealthConnected(true);
                    const lastSync = await getLastSyncTime();
                    setLastSyncTime(formatLastSync(lastSync));
                    await loadHealthData(); // Reload with new data
                    Alert.alert('Connected!', `Your ${getHealthPlatformName()} data has been synced.`);
                }
            } else {
                Alert.alert(
                    'Permission Required',
                    `Please grant ${getHealthPlatformName()} permissions to sync your health data.`,
                    [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Open Settings', onPress: () => openHealthConnectSettings() }
                    ]
                );
            }
        } catch (error) {
            console.error('Health connect error:', error);
            Alert.alert('Error', 'Failed to connect to health data. Please try again.');
        } finally {
            setSyncing(false);
        }
    };

    const syncNow = async () => {
        setSyncing(true);
        try {
            // Try to fetch fresh data from device
            const deviceData = await fetchHealthData();
            if (deviceData) {
                setTodayFromDevice(deviceData);
                await syncHealthData();
                const lastSync = await getLastSyncTime();
                setLastSyncTime(formatLastSync(lastSync));
            }
            await loadHealthData();
        } catch (error) {
            console.error('Sync error:', error);
        } finally {
            setSyncing(false);
        }
    };

    const loadHealthData = async () => {
        try {
            console.log('📊 [Health Tab] Loading health data...');
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                console.log('❌ [Health Tab] No user logged in');
                setLoading(false);
                return;
            }
            console.log('👤 [Health Tab] User:', user.id);

            // Get last 15 days of health data
            const { data, error } = await supabase
                .from('health_data')
                .select('*')
                .eq('user_id', user.id)
                .order('source_date', { ascending: false })
                .limit(50);

            if (error) {
                console.error('❌ [Health Tab] Supabase error:', error);
                setLoading(false);
                return;
            }

            console.log(`📊 [Health Tab] Found ${data?.length || 0} records`);
            if (data && data.length > 0) {
                console.log('📊 [Health Tab] Sample record:', JSON.stringify(data[0], null, 2));
            }

            // Group by date and merge data
            const groupedData: Record<string, HealthMetrics> = {};

            data?.forEach((record) => {
                const date = record.source_date;
                if (!groupedData[date]) {
                    groupedData[date] = { date };
                }

                const recordData = record.data as Record<string, unknown>;

                // Merge all health data types
                if (recordData.sleepDuration !== undefined) groupedData[date].sleepDuration = recordData.sleepDuration as number;
                if (recordData.duration_hours !== undefined) groupedData[date].sleepDuration = recordData.duration_hours as number;
                if (recordData.sleepQuality !== undefined) groupedData[date].sleepQuality = recordData.sleepQuality as number;
                if (recordData.quality_percent !== undefined) groupedData[date].sleepQuality = recordData.quality_percent as number;
                if (recordData.deepSleep !== undefined) groupedData[date].deepSleep = recordData.deepSleep as number;
                if (recordData.deep_sleep_hours !== undefined) groupedData[date].deepSleep = recordData.deep_sleep_hours as number;
                if (recordData.remSleep !== undefined) groupedData[date].remSleep = recordData.remSleep as number;
                if (recordData.rem_sleep_hours !== undefined) groupedData[date].remSleep = recordData.rem_sleep_hours as number;
                if (recordData.steps !== undefined) groupedData[date].steps = recordData.steps as number;
                if (recordData.count !== undefined) groupedData[date].steps = recordData.count as number;
                if (recordData.distance !== undefined) groupedData[date].distance = recordData.distance as number;
                if (recordData.distance_km !== undefined) groupedData[date].distance = recordData.distance_km as number;
                if (recordData.activeCalories !== undefined) groupedData[date].activeCalories = recordData.activeCalories as number;
                if (recordData.active_calories !== undefined) groupedData[date].activeCalories = recordData.active_calories as number;
                if (recordData.restingHeartRate !== undefined) groupedData[date].restingHeartRate = recordData.restingHeartRate as number;
                if (recordData.resting_bpm !== undefined) groupedData[date].restingHeartRate = recordData.resting_bpm as number;
                if (recordData.hrv !== undefined) groupedData[date].hrv = recordData.hrv as number;
                if (recordData.value_ms !== undefined) groupedData[date].hrv = recordData.value_ms as number;
                if (recordData.standingHours !== undefined) groupedData[date].standingHours = recordData.standingHours as number;
                if (recordData.standing_hours !== undefined) groupedData[date].standingHours = recordData.standing_hours as number;
                if (recordData.exerciseMinutes !== undefined) groupedData[date].exerciseMinutes = recordData.exerciseMinutes as number;
                if (recordData.exercise_minutes !== undefined) groupedData[date].exerciseMinutes = recordData.exercise_minutes as number;
                if (recordData.flightsClimbed !== undefined) groupedData[date].flightsClimbed = recordData.flightsClimbed as number;
                if (recordData.flights_climbed !== undefined) groupedData[date].flightsClimbed = recordData.flights_climbed as number;
                if (recordData.bloodOxygen !== undefined) groupedData[date].bloodOxygen = recordData.bloodOxygen as number;
                if (recordData.respiratoryRate !== undefined) groupedData[date].respiratoryRate = recordData.respiratoryRate as number;
            });

            const history = Object.entries(groupedData)
                .map(([date, metrics]) => ({ date, metrics }))
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            console.log(`📊 [Health Tab] Grouped into ${history.length} days`);
            if (history.length > 0) {
                console.log('📊 [Health Tab] First day metrics:', JSON.stringify(history[0], null, 2));
            }

            setHealthHistory(history);
        } catch (err) {
            console.error('❌ [Health Tab] Error:', err);
        } finally {
            setLoading(false);
        }
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await syncNow();
        setRefreshing(false);
    };

    const formatDate = (dateStr: string): string => {
        const date = new Date(dateStr);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (dateStr === today.toISOString().split('T')[0]) return 'Today';
        if (dateStr === yesterday.toISOString().split('T')[0]) return 'Yesterday';

        return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    };

    const getQualityColor = (value: number, thresholds: { low: number; high: number }) => {
        if (value >= thresholds.high) return Colors.success[500];
        if (value >= thresholds.low) return Colors.warning[500];
        return Colors.error[500];
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Colors.primary[500]} />
                <Text style={styles.loadingText}>Loading health data...</Text>
            </View>
        );
    }

    const currentDayData = healthHistory[selectedDay]?.metrics;

    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={styles.content}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            showsVerticalScrollIndicator={false}
        >
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerTop}>
                    <View>
                        <Text style={styles.title}>Health</Text>
                        <Text style={styles.subtitle}>Your body metrics & trends</Text>
                    </View>
                    {isHealthSupported() && (
                        <TouchableOpacity
                            style={[styles.syncButton, syncing && styles.syncButtonDisabled]}
                            onPress={healthConnected ? syncNow : connectHealth}
                            disabled={syncing}
                        >
                            {syncing ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <Text style={styles.syncButtonText}>
                                    {healthConnected ? '🔄 Sync' : '🔗 Connect'}
                                </Text>
                            )}
                        </TouchableOpacity>
                    )}
                </View>

                {/* Health Connection Status */}
                {isHealthSupported() && (
                    <View style={styles.connectionStatus}>
                        <View style={[styles.statusDot, healthConnected ? styles.statusConnected : styles.statusDisconnected]} />
                        <Text style={styles.statusText}>
                            {healthConnected
                                ? `${getHealthPlatformName()} • ${lastSyncTime}`
                                : `Connect ${getHealthPlatformName()} for live data`
                            }
                        </Text>
                    </View>
                )}
            </View>

            {/* Day Selector */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.daySelector}
                contentContainerStyle={styles.daySelectorContent}
            >
                {healthHistory.slice(0, 7).map((day, index) => (
                    <TouchableOpacity
                        key={day.date}
                        style={[styles.dayButton, selectedDay === index && styles.dayButtonActive]}
                        onPress={() => setSelectedDay(index)}
                    >
                        <Text style={[styles.dayButtonText, selectedDay === index && styles.dayButtonTextActive]}>
                            {formatDate(day.date)}
                        </Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            {!currentDayData ? (
                <View style={styles.emptyState}>
                    <Text style={styles.emptyEmoji}>📊</Text>
                    <Text style={styles.emptyTitle}>No Health Data</Text>
                    <Text style={styles.emptyText}>
                        Connect Apple Health or Google Fit to see your health metrics here.
                    </Text>
                </View>
            ) : (
                <>
                    {/* Category Tabs */}
                    <View style={styles.tabContainer}>
                        {(['overview', 'sleep', 'activity', 'vitals'] as const).map((tab) => (
                            <TouchableOpacity
                                key={tab}
                                style={[styles.tab, activeTab === tab && styles.tabActive]}
                                onPress={() => setActiveTab(tab)}
                            >
                                <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Overview Tab */}
                    {activeTab === 'overview' && (
                        <View style={styles.metricsGrid}>
                            {currentDayData.sleepDuration != null && (
                                <MetricCard
                                    icon="🛏️"
                                    label="Sleep"
                                    value={currentDayData.sleepDuration.toFixed(1)}
                                    unit="hours"
                                    color={Colors.health.sleep}
                                    quality={getQualityColor(currentDayData.sleepDuration, { low: 6, high: 7 })}
                                />
                            )}
                            {currentDayData.steps != null && (
                                <MetricCard
                                    icon="👟"
                                    label="Steps"
                                    value={currentDayData.steps.toLocaleString()}
                                    unit="steps"
                                    color={Colors.health.steps}
                                    quality={getQualityColor(currentDayData.steps, { low: 5000, high: 10000 })}
                                />
                            )}
                            {currentDayData.hrv != null && (
                                <MetricCard
                                    icon="💓"
                                    label="HRV"
                                    value={currentDayData.hrv.toString()}
                                    unit="ms"
                                    color={Colors.health.hrv}
                                    quality={getQualityColor(currentDayData.hrv, { low: 30, high: 50 })}
                                />
                            )}
                            {currentDayData.activeCalories != null && (
                                <MetricCard
                                    icon="🔥"
                                    label="Calories"
                                    value={currentDayData.activeCalories.toString()}
                                    unit="kcal"
                                    color={Colors.health.calories}
                                    quality={getQualityColor(currentDayData.activeCalories, { low: 200, high: 400 })}
                                />
                            )}
                            {currentDayData.restingHeartRate != null && (
                                <MetricCard
                                    icon="❤️"
                                    label="Resting HR"
                                    value={currentDayData.restingHeartRate.toString()}
                                    unit="bpm"
                                    color={Colors.health.heart}
                                    quality={getQualityColor(100 - currentDayData.restingHeartRate, { low: 30, high: 40 })}
                                />
                            )}
                            {currentDayData.exerciseMinutes != null && (
                                <MetricCard
                                    icon="🏃"
                                    label="Exercise"
                                    value={currentDayData.exerciseMinutes.toString()}
                                    unit="min"
                                    color={Colors.accent[500]}
                                    quality={getQualityColor(currentDayData.exerciseMinutes, { low: 20, high: 30 })}
                                />
                            )}
                        </View>
                    )}

                    {/* Sleep Tab */}
                    {activeTab === 'sleep' && (
                        <View style={styles.detailSection}>
                            <View style={styles.heroMetric}>
                                <Text style={styles.heroIcon}>🛏️</Text>
                                <Text style={styles.heroValue}>
                                    {currentDayData.sleepDuration?.toFixed(1) || '--'}
                                </Text>
                                <Text style={styles.heroUnit}>hours of sleep</Text>
                            </View>

                            <View style={styles.detailGrid}>
                                <DetailRow
                                    label="Sleep Quality"
                                    value={currentDayData.sleepQuality ? `${currentDayData.sleepQuality}%` : '--'}
                                    icon="⭐"
                                />
                                <DetailRow
                                    label="Deep Sleep"
                                    value={currentDayData.deepSleep ? `${currentDayData.deepSleep.toFixed(1)}h` : '--'}
                                    icon="🌙"
                                />
                                <DetailRow
                                    label="REM Sleep"
                                    value={currentDayData.remSleep ? `${currentDayData.remSleep.toFixed(1)}h` : '--'}
                                    icon="💭"
                                />
                            </View>

                            {/* Sleep Bar Visualization */}
                            {currentDayData.sleepDuration && (
                                <View style={styles.sleepBarContainer}>
                                    <Text style={styles.sleepBarLabel}>Sleep Breakdown</Text>
                                    <View style={styles.sleepBar}>
                                        {currentDayData.deepSleep && (
                                            <View
                                                style={[
                                                    styles.sleepBarSegment,
                                                    {
                                                        width: `${(currentDayData.deepSleep / currentDayData.sleepDuration) * 100}%`,
                                                        backgroundColor: '#5E60CE',
                                                    }
                                                ]}
                                            />
                                        )}
                                        {currentDayData.remSleep && (
                                            <View
                                                style={[
                                                    styles.sleepBarSegment,
                                                    {
                                                        width: `${(currentDayData.remSleep / currentDayData.sleepDuration) * 100}%`,
                                                        backgroundColor: '#7B2CBF',
                                                    }
                                                ]}
                                            />
                                        )}
                                        <View
                                            style={[
                                                styles.sleepBarSegment,
                                                {
                                                    flex: 1,
                                                    backgroundColor: '#C77DFF',
                                                }
                                            ]}
                                        />
                                    </View>
                                    <View style={styles.sleepLegend}>
                                        <View style={styles.legendItem}>
                                            <View style={[styles.legendDot, { backgroundColor: '#5E60CE' }]} />
                                            <Text style={styles.legendText}>Deep</Text>
                                        </View>
                                        <View style={styles.legendItem}>
                                            <View style={[styles.legendDot, { backgroundColor: '#7B2CBF' }]} />
                                            <Text style={styles.legendText}>REM</Text>
                                        </View>
                                        <View style={styles.legendItem}>
                                            <View style={[styles.legendDot, { backgroundColor: '#C77DFF' }]} />
                                            <Text style={styles.legendText}>Light</Text>
                                        </View>
                                    </View>
                                </View>
                            )}
                        </View>
                    )}

                    {/* Activity Tab */}
                    {activeTab === 'activity' && (
                        <View style={styles.detailSection}>
                            <View style={styles.heroMetric}>
                                <Text style={styles.heroIcon}>👟</Text>
                                <Text style={styles.heroValue}>
                                    {currentDayData.steps?.toLocaleString() || '--'}
                                </Text>
                                <Text style={styles.heroUnit}>steps taken</Text>
                            </View>

                            <View style={styles.activityRings}>
                                <View style={styles.ringItem}>
                                    <View style={[styles.ring, { borderColor: Colors.health.calories }]}>
                                        <Text style={styles.ringValue}>{currentDayData.activeCalories || '--'}</Text>
                                        <Text style={styles.ringUnit}>kcal</Text>
                                    </View>
                                    <Text style={styles.ringLabel}>Move</Text>
                                </View>
                                <View style={styles.ringItem}>
                                    <View style={[styles.ring, { borderColor: Colors.success[500] }]}>
                                        <Text style={styles.ringValue}>{currentDayData.exerciseMinutes || '--'}</Text>
                                        <Text style={styles.ringUnit}>min</Text>
                                    </View>
                                    <Text style={styles.ringLabel}>Exercise</Text>
                                </View>
                                <View style={styles.ringItem}>
                                    <View style={[styles.ring, { borderColor: Colors.primary[500] }]}>
                                        <Text style={styles.ringValue}>{currentDayData.standingHours || '--'}</Text>
                                        <Text style={styles.ringUnit}>hrs</Text>
                                    </View>
                                    <Text style={styles.ringLabel}>Stand</Text>
                                </View>
                            </View>

                            <View style={styles.detailGrid}>
                                <DetailRow
                                    label="Distance"
                                    value={currentDayData.distance ? `${currentDayData.distance.toFixed(1)} km` : '--'}
                                    icon="📍"
                                />
                                <DetailRow
                                    label="Floors Climbed"
                                    value={currentDayData.flightsClimbed?.toString() || '--'}
                                    icon="🪜"
                                />
                            </View>
                        </View>
                    )}

                    {/* Vitals Tab */}
                    {activeTab === 'vitals' && (
                        <View style={styles.detailSection}>
                            <View style={styles.heroMetric}>
                                <Text style={styles.heroIcon}>💓</Text>
                                <Text style={styles.heroValue}>
                                    {currentDayData.hrv || '--'}
                                </Text>
                                <Text style={styles.heroUnit}>ms HRV</Text>
                            </View>

                            <View style={styles.vitalsCards}>
                                <View style={styles.vitalCard}>
                                    <View style={styles.vitalHeader}>
                                        <Text style={styles.vitalIcon}>❤️</Text>
                                        <Text style={styles.vitalLabel}>Resting Heart Rate</Text>
                                    </View>
                                    <Text style={styles.vitalValue}>
                                        {currentDayData.restingHeartRate || '--'} <Text style={styles.vitalUnit}>bpm</Text>
                                    </Text>
                                    <View style={styles.vitalRange}>
                                        <Text style={styles.vitalRangeText}>Normal: 60-100 bpm</Text>
                                    </View>
                                </View>

                                <View style={styles.vitalCard}>
                                    <View style={styles.vitalHeader}>
                                        <Text style={styles.vitalIcon}>🫁</Text>
                                        <Text style={styles.vitalLabel}>Blood Oxygen</Text>
                                    </View>
                                    <Text style={styles.vitalValue}>
                                        {currentDayData.bloodOxygen?.toFixed(1) || '--'} <Text style={styles.vitalUnit}>%</Text>
                                    </Text>
                                    <View style={styles.vitalRange}>
                                        <Text style={styles.vitalRangeText}>Normal: 95-100%</Text>
                                    </View>
                                </View>

                                <View style={styles.vitalCard}>
                                    <View style={styles.vitalHeader}>
                                        <Text style={styles.vitalIcon}>🌬️</Text>
                                        <Text style={styles.vitalLabel}>Respiratory Rate</Text>
                                    </View>
                                    <Text style={styles.vitalValue}>
                                        {currentDayData.respiratoryRate?.toFixed(1) || '--'} <Text style={styles.vitalUnit}>br/min</Text>
                                    </Text>
                                    <View style={styles.vitalRange}>
                                        <Text style={styles.vitalRangeText}>Normal: 12-20 br/min</Text>
                                    </View>
                                </View>
                            </View>
                        </View>
                    )}

                    {/* Weekly Trend Chart */}
                    <View style={styles.trendSection}>
                        <Text style={styles.trendTitle}>7-Day Steps Trend</Text>
                        <View style={styles.trendChart}>
                            {healthHistory.slice(0, 7).reverse().map((day, index) => {
                                const steps = day.metrics.steps || 0;
                                const maxSteps = Math.max(...healthHistory.slice(0, 7).map(d => d.metrics.steps || 0));
                                const height = maxSteps > 0 ? (steps / maxSteps) * 100 : 0;

                                return (
                                    <View key={day.date} style={styles.trendBarContainer}>
                                        <View style={styles.trendBarWrapper}>
                                            <View
                                                style={[
                                                    styles.trendBar,
                                                    {
                                                        height: `${height}%`,
                                                        backgroundColor: steps >= 10000 ? Colors.success[500] :
                                                            steps >= 5000 ? Colors.warning[500] : Colors.neutral[300],
                                                    }
                                                ]}
                                            />
                                        </View>
                                        <Text style={styles.trendLabel}>
                                            {new Date(day.date).toLocaleDateString('en-US', { weekday: 'narrow' })}
                                        </Text>
                                    </View>
                                );
                            })}
                        </View>
                    </View>
                </>
            )}
        </ScrollView>
    );
}

// Metric Card Component
function MetricCard({ icon, label, value, unit, color, quality }: {
    icon: string;
    label: string;
    value: string;
    unit: string;
    color: string;
    quality: string;
}) {
    return (
        <View style={[styles.metricCard, { backgroundColor: color + '15' }]}>
            <View style={[styles.metricIconBg, { backgroundColor: color }]}>
                <Text style={styles.metricIcon}>{icon}</Text>
            </View>
            <Text style={styles.metricValue}>{value}</Text>
            <Text style={styles.metricUnit}>{unit}</Text>
            <Text style={styles.metricLabel}>{label}</Text>
            <View style={[styles.qualityDot, { backgroundColor: quality }]} />
        </View>
    );
}

// Detail Row Component
function DetailRow({ label, value, icon }: { label: string; value: string; icon: string }) {
    return (
        <View style={styles.detailRow}>
            <View style={styles.detailLeft}>
                <Text style={styles.detailIcon}>{icon}</Text>
                <Text style={styles.detailLabel}>{label}</Text>
            </View>
            <Text style={styles.detailValue}>{value}</Text>
        </View>
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
        paddingBottom: 40,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: Colors.background.primary,
    },
    loadingText: {
        marginTop: 16,
        fontSize: 16,
        color: Colors.text.secondary,
        fontWeight: '500',
    },
    header: {
        marginBottom: 20,
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    title: {
        fontSize: 28,
        fontWeight: '800',
        color: Colors.text.primary,
        letterSpacing: -0.5,
    },
    subtitle: {
        fontSize: 14,
        color: Colors.text.secondary,
        marginTop: 4,
        fontWeight: '500',
    },
    syncButton: {
        backgroundColor: Colors.primary[500],
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 12,
        minWidth: 90,
        alignItems: 'center',
    },
    syncButtonDisabled: {
        opacity: 0.7,
    },
    syncButtonText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 14,
    },
    connectionStatus: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 12,
        paddingVertical: 8,
        paddingHorizontal: 12,
        backgroundColor: Colors.neutral[50],
        borderRadius: 10,
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 8,
    },
    statusConnected: {
        backgroundColor: Colors.success[500],
    },
    statusDisconnected: {
        backgroundColor: Colors.neutral[300],
    },
    statusText: {
        fontSize: 13,
        color: Colors.text.secondary,
        fontWeight: '500',
    },
    daySelector: {
        marginBottom: 16,
        marginHorizontal: -20,
    },
    daySelectorContent: {
        paddingHorizontal: 20,
        gap: 10,
    },
    dayButton: {
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 12,
        backgroundColor: Colors.neutral[100],
    },
    dayButtonActive: {
        backgroundColor: Colors.primary[500],
    },
    dayButtonText: {
        fontSize: 13,
        fontWeight: '600',
        color: Colors.text.secondary,
    },
    dayButtonTextActive: {
        color: '#fff',
    },
    tabContainer: {
        flexDirection: 'row',
        backgroundColor: Colors.neutral[100],
        borderRadius: 14,
        padding: 4,
        marginBottom: 20,
    },
    tab: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 10,
        alignItems: 'center',
    },
    tabActive: {
        backgroundColor: '#fff',
        shadowColor: Colors.neutral[900],
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 2,
    },
    tabText: {
        fontSize: 13,
        fontWeight: '600',
        color: Colors.text.secondary,
    },
    tabTextActive: {
        color: Colors.primary[600],
        fontWeight: '700',
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 60,
        backgroundColor: '#fff',
        borderRadius: 20,
        shadowColor: Colors.neutral[900],
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
        elevation: 2,
    },
    emptyEmoji: {
        fontSize: 56,
        marginBottom: 16,
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: Colors.text.primary,
        marginBottom: 8,
    },
    emptyText: {
        fontSize: 15,
        color: Colors.text.secondary,
        textAlign: 'center',
        paddingHorizontal: 40,
        lineHeight: 22,
    },
    metricsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    metricCard: {
        width: '47%',
        borderRadius: 18,
        padding: 16,
        alignItems: 'center',
        position: 'relative',
    },
    metricIconBg: {
        width: 44,
        height: 44,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
    },
    metricIcon: {
        fontSize: 22,
    },
    metricValue: {
        fontSize: 26,
        fontWeight: '800',
        color: Colors.text.primary,
        letterSpacing: -0.5,
    },
    metricUnit: {
        fontSize: 12,
        color: Colors.text.tertiary,
        fontWeight: '600',
        marginTop: 2,
    },
    metricLabel: {
        fontSize: 12,
        color: Colors.text.secondary,
        fontWeight: '600',
        marginTop: 6,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    qualityDot: {
        position: 'absolute',
        top: 12,
        right: 12,
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    detailSection: {
        gap: 20,
    },
    heroMetric: {
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 24,
        padding: 32,
        shadowColor: Colors.neutral[900],
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
        elevation: 2,
    },
    heroIcon: {
        fontSize: 48,
        marginBottom: 12,
    },
    heroValue: {
        fontSize: 56,
        fontWeight: '800',
        color: Colors.text.primary,
        letterSpacing: -2,
    },
    heroUnit: {
        fontSize: 16,
        color: Colors.text.secondary,
        fontWeight: '600',
        marginTop: 4,
    },
    detailGrid: {
        backgroundColor: '#fff',
        borderRadius: 18,
        padding: 4,
        shadowColor: Colors.neutral[900],
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 1,
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: Colors.neutral[100],
    },
    detailLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    detailIcon: {
        fontSize: 20,
    },
    detailLabel: {
        fontSize: 15,
        color: Colors.text.primary,
        fontWeight: '500',
    },
    detailValue: {
        fontSize: 16,
        color: Colors.text.primary,
        fontWeight: '700',
    },
    sleepBarContainer: {
        backgroundColor: '#fff',
        borderRadius: 18,
        padding: 20,
        shadowColor: Colors.neutral[900],
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 1,
    },
    sleepBarLabel: {
        fontSize: 14,
        fontWeight: '700',
        color: Colors.text.primary,
        marginBottom: 16,
    },
    sleepBar: {
        flexDirection: 'row',
        height: 20,
        borderRadius: 10,
        overflow: 'hidden',
        backgroundColor: Colors.neutral[100],
    },
    sleepBarSegment: {
        height: '100%',
    },
    sleepLegend: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 24,
        marginTop: 16,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    legendDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    legendText: {
        fontSize: 12,
        color: Colors.text.secondary,
        fontWeight: '500',
    },
    activityRings: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 24,
        shadowColor: Colors.neutral[900],
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 1,
    },
    ringItem: {
        alignItems: 'center',
    },
    ring: {
        width: 80,
        height: 80,
        borderRadius: 40,
        borderWidth: 6,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#fff',
    },
    ringValue: {
        fontSize: 20,
        fontWeight: '800',
        color: Colors.text.primary,
    },
    ringUnit: {
        fontSize: 10,
        color: Colors.text.tertiary,
        fontWeight: '600',
    },
    ringLabel: {
        fontSize: 12,
        color: Colors.text.secondary,
        fontWeight: '600',
        marginTop: 10,
    },
    vitalsCards: {
        gap: 12,
    },
    vitalCard: {
        backgroundColor: '#fff',
        borderRadius: 18,
        padding: 20,
        shadowColor: Colors.neutral[900],
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 1,
    },
    vitalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 12,
    },
    vitalIcon: {
        fontSize: 24,
    },
    vitalLabel: {
        fontSize: 15,
        color: Colors.text.secondary,
        fontWeight: '600',
    },
    vitalValue: {
        fontSize: 36,
        fontWeight: '800',
        color: Colors.text.primary,
        letterSpacing: -1,
    },
    vitalUnit: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.text.tertiary,
    },
    vitalRange: {
        marginTop: 8,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: Colors.neutral[100],
    },
    vitalRangeText: {
        fontSize: 12,
        color: Colors.text.tertiary,
        fontWeight: '500',
    },
    trendSection: {
        marginTop: 24,
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 20,
        shadowColor: Colors.neutral[900],
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 1,
    },
    trendTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: Colors.text.primary,
        marginBottom: 20,
    },
    trendChart: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        height: 120,
    },
    trendBarContainer: {
        flex: 1,
        alignItems: 'center',
    },
    trendBarWrapper: {
        height: 100,
        width: 24,
        backgroundColor: Colors.neutral[100],
        borderRadius: 12,
        justifyContent: 'flex-end',
        overflow: 'hidden',
    },
    trendBar: {
        width: '100%',
        borderRadius: 12,
    },
    trendLabel: {
        fontSize: 11,
        color: Colors.text.secondary,
        fontWeight: '600',
        marginTop: 8,
    },
});
