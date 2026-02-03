import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    RefreshControl,
    Modal,
    Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import Colors from '../constants/Colors';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

interface CheckInData {
    id: string;
    type: 'morning' | 'midday' | 'evening';
    created_at: string;
    data: Record<string, unknown>;
}

interface EnergyScore {
    date: string;
    score: number;
    explanation?: string;
}

export default function HistoryScreen() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [checkInHistory, setCheckInHistory] = useState<CheckInData[]>([]);
    const [energyHistory, setEnergyHistory] = useState<EnergyScore[]>([]);
    const [selectedCheckIn, setSelectedCheckIn] = useState<CheckInData | null>(null);
    const [showModal, setShowModal] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                setLoading(false);
                return;
            }

            const headers = {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
            };

            // Fetch history
            const historyResponse = await fetch(`${API_URL}/insights/history?limit=50`, { headers });
            if (historyResponse.ok) {
                const historyResult = await historyResponse.json();
                if (historyResult.success) {
                    setCheckInHistory(historyResult.data.checkIns || []);
                }
            }

            // Fetch energy history
            const energyResponse = await fetch(`${API_URL}/insights/energy-history?days=30`, { headers });
            if (energyResponse.ok) {
                const energyResult = await energyResponse.json();
                if (energyResult.success) {
                    setEnergyHistory(energyResult.data || []);
                }
            }
        } catch (err) {
            console.error('Error loading history:', err);
        } finally {
            setLoading(false);
        }
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    };

    const formatDate = (dateStr: string): string => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
        });
    };

    const formatTime = (dateStr: string): string => {
        const date = new Date(dateStr);
        return date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
        });
    };

    const getCheckInEmoji = (type: string) => {
        switch (type) {
            case 'morning': return '🌅';
            case 'midday': return '☀️';
            case 'evening': return '🌙';
            default: return '📝';
        }
    };

    const getCheckInTitle = (type: string) => {
        switch (type) {
            case 'morning': return 'Morning Check-in';
            case 'midday': return 'Mid-day Pulse';
            case 'evening': return 'Evening Reflection';
            default: return 'Check-in';
        }
    };

    const formatBoolean = (val: unknown): string => {
        if (val === true) return 'Yes';
        if (val === false) return 'No';
        return '—';
    };

    const formatString = (val: unknown): string => {
        if (typeof val !== 'string') return '';
        // Special case for 'ok' -> 'OK'
        if (val.toLowerCase() === 'ok') return 'OK';
        return val.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    };

    const renderCheckInDetails = (checkIn: CheckInData) => {
        const data = checkIn.data || {};
        const items: { label: string; value: string }[] = [];

        // Morning check-in fields
        if (checkIn.type === 'morning') {
            if (data.rested_score) items.push({ label: 'Rested Score', value: `${data.rested_score}/10` });
            if (data.motivation_level) items.push({ label: 'Motivation', value: formatString(data.motivation_level) });
            if (data.wake_on_time !== undefined) items.push({ label: 'Wake on Time', value: formatBoolean(data.wake_on_time) });
            if (data.sleep_felt_complete !== undefined) items.push({ label: 'Sleep Complete', value: formatBoolean(data.sleep_felt_complete) });
        }
        // Midday check-in fields
        else if (checkIn.type === 'midday') {
            if (data.energy_level) items.push({ label: 'Energy', value: formatString(data.energy_level) });
            if (data.state) items.push({ label: 'Feeling', value: formatString(data.state) });
            if (data.stress_level) items.push({ label: 'Stress', value: `${data.stress_level}/10` });
        }
        // Evening check-in fields
        else if (checkIn.type === 'evening') {
            if (data.drain_source) items.push({ label: 'Main Drain', value: formatString(data.drain_source) });
            if (data.day_vs_expectations) items.push({ label: 'Day vs Exp.', value: formatString(data.day_vs_expectations) });
            if (data.mood) items.push({ label: 'Mood', value: formatString(data.mood) });
            if (data.stress_level) items.push({ label: 'Stress', value: `${data.stress_level}/10` });

            // Habits
            if (data.exercise_done !== undefined) items.push({ label: 'Exercise', value: formatBoolean(data.exercise_done) });
            if (data.outdoor_time !== undefined) items.push({ label: 'Outdoors', value: formatBoolean(data.outdoor_time) });
            if (data.late_caffeine !== undefined) items.push({ label: 'Late Caffeine', value: formatBoolean(data.late_caffeine) });
            if (data.skipped_meals !== undefined) items.push({ label: 'Skipped Meals', value: formatBoolean(data.skipped_meals) });
            if (data.alcohol !== undefined) items.push({ label: 'Alcohol', value: formatBoolean(data.alcohol) });
            if (data.water_glasses) items.push({ label: 'Water', value: `${data.water_glasses} glasses` });
        }

        return (
            <View style={styles.detailsContainer}>
                <ScrollView style={{ maxHeight: 300 }}>
                    {items.length > 0 ? items.map((item, index) => (
                        <View key={index} style={styles.detailRow}>
                            <Text style={styles.detailLabel}>{item.label}</Text>
                            <Text style={styles.detailValue}>{item.value}</Text>
                        </View>
                    )) : (
                        <Text style={styles.emptySubtext}>No details recorded</Text>
                    )}
                </ScrollView>
            </View>
        );
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Colors.primary[500]} />
                <Text style={styles.loadingText}>Loading history...</Text>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Text style={styles.backButtonText}>← Back</Text>
                </TouchableOpacity>
                <Text style={styles.title}>History</Text>
                <View style={styles.headerSpacer} />
            </View>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.content}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
                {/* Energy Scores Summary */}
                {energyHistory.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>📊 Energy Scores</Text>
                        <View style={styles.energyGrid}>
                            {energyHistory.slice(0, 7).map((score) => (
                                <View key={score.date} style={styles.energyItem}>
                                    <Text style={styles.energyDate}>{formatDate(score.date)}</Text>
                                    <View style={[
                                        styles.energyBadge,
                                        {
                                            backgroundColor: score.score >= 7 ? Colors.success[100] :
                                                score.score >= 4 ? Colors.warning[100] :
                                                    Colors.error[100]
                                        }
                                    ]}>
                                        <Text style={[
                                            styles.energyScore,
                                            {
                                                color: score.score >= 7 ? Colors.success[700] :
                                                    score.score >= 4 ? Colors.warning[700] :
                                                        Colors.error[700]
                                            }
                                        ]}>
                                            {score.score.toFixed(1)}
                                        </Text>
                                    </View>
                                </View>
                            ))}
                        </View>
                    </View>
                )}

                {/* Check-in History */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>📝 Check-in History</Text>
                    {checkInHistory.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyEmoji}>📭</Text>
                            <Text style={styles.emptyText}>No check-ins yet</Text>
                            <Text style={styles.emptySubtext}>Start tracking to see your history here</Text>
                        </View>
                    ) : (
                        checkInHistory.map((checkIn) => (
                            <TouchableOpacity
                                key={checkIn.id}
                                style={styles.historyItem}
                                onPress={() => {
                                    setSelectedCheckIn(checkIn);
                                    setShowModal(true);
                                }}
                                activeOpacity={0.7}
                            >
                                <View style={styles.historyIcon}>
                                    <Text style={styles.historyEmoji}>{getCheckInEmoji(checkIn.type)}</Text>
                                </View>
                                <View style={styles.historyContent}>
                                    <Text style={styles.historyType}>{getCheckInTitle(checkIn.type)}</Text>
                                    <Text style={styles.historyDate}>
                                        {formatDate(checkIn.created_at)} at {formatTime(checkIn.created_at)}
                                    </Text>
                                </View>
                                <Text style={styles.historyArrow}>→</Text>
                            </TouchableOpacity>
                        ))
                    )}
                </View>
            </ScrollView>

            {/* Detail Modal */}
            <Modal
                visible={showModal}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setShowModal(false)}
            >
                <Pressable style={styles.modalOverlay} onPress={() => setShowModal(false)}>
                    <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
                        {selectedCheckIn && (
                            <>
                                <View style={styles.modalHeader}>
                                    <Text style={styles.modalEmoji}>{getCheckInEmoji(selectedCheckIn.type)}</Text>
                                    <View>
                                        <Text style={styles.modalTitle}>{getCheckInTitle(selectedCheckIn.type)}</Text>
                                        <Text style={styles.modalDate}>
                                            {formatDate(selectedCheckIn.created_at)} at {formatTime(selectedCheckIn.created_at)}
                                        </Text>
                                    </View>
                                </View>
                                {renderCheckInDetails(selectedCheckIn)}
                                <TouchableOpacity
                                    style={styles.modalCloseBtn}
                                    onPress={() => setShowModal(false)}
                                >
                                    <Text style={styles.modalCloseBtnText}>Done</Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </Pressable>
                </Pressable>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.neutral[50],
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: Colors.neutral[50],
    },
    loadingText: {
        marginTop: 12,
        fontSize: 16,
        color: Colors.neutral[500],
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: Colors.neutral[200],
        backgroundColor: '#fff',
    },
    backButton: {
        paddingVertical: 8,
        paddingRight: 16,
    },
    backButtonText: {
        fontSize: 16,
        color: Colors.primary[600],
        fontWeight: '600',
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
        color: Colors.neutral[900],
    },
    headerSpacer: {
        width: 60,
    },
    scrollView: {
        flex: 1,
    },
    content: {
        padding: 20,
        paddingBottom: 40,
    },
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: Colors.neutral[800],
        marginBottom: 16,
    },
    energyGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    energyItem: {
        alignItems: 'center',
        minWidth: 70,
    },
    energyDate: {
        fontSize: 11,
        color: Colors.neutral[500],
        marginBottom: 4,
    },
    energyBadge: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
    },
    energyScore: {
        fontSize: 16,
        fontWeight: '700',
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 40,
        backgroundColor: '#fff',
        borderRadius: 16,
    },
    emptyEmoji: {
        fontSize: 48,
        marginBottom: 12,
    },
    emptyText: {
        fontSize: 18,
        fontWeight: '600',
        color: Colors.neutral[700],
    },
    emptySubtext: {
        fontSize: 14,
        color: Colors.neutral[500],
        marginTop: 4,
    },
    historyItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    historyIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: Colors.primary[50],
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 14,
    },
    historyEmoji: {
        fontSize: 24,
    },
    historyContent: {
        flex: 1,
    },
    historyType: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.neutral[800],
    },
    historyDate: {
        fontSize: 13,
        color: Colors.neutral[500],
        marginTop: 2,
    },
    historyArrow: {
        fontSize: 20,
        color: Colors.neutral[400],
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        maxHeight: '70%',
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
    },
    modalEmoji: {
        fontSize: 40,
        marginRight: 16,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: Colors.neutral[900],
    },
    modalDate: {
        fontSize: 14,
        color: Colors.neutral[500],
        marginTop: 2,
    },
    detailsContainer: {
        backgroundColor: Colors.neutral[50],
        borderRadius: 16,
        padding: 16,
        marginBottom: 20,
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: Colors.neutral[200],
    },
    detailLabel: {
        fontSize: 15,
        color: Colors.neutral[600],
    },
    detailValue: {
        fontSize: 15,
        fontWeight: '600',
        color: Colors.neutral[800],
    },
    modalCloseBtn: {
        backgroundColor: Colors.primary[500],
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
    },
    modalCloseBtnText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
    },
});
