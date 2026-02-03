import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    RefreshControl,
    Dimensions,
    Animated,
    Alert,
    Modal,
    Pressable,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Colors from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import { schedulePatternReminder, sendImmediatePatternReminder } from '@/lib/notificationService';
import {
    isCalendarEnabled,
    fetchWeekCalendarData,
    syncWeekCalendarData,
    DailyCognitiveLoad,
    getCognitiveLoadScore,
    getCognitiveLoadLabel,
} from '@/lib/calendarService';

const { width: screenWidth } = Dimensions.get('window');
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

// ═══════════════════════════════════════════════════════════════════
// NATURE-INSPIRED COLOR PALETTE (matching Today tab)
// ═══════════════════════════════════════════════════════════════════
const NatureColors = {
    // Sage Green - Primary (calm, growth, health)
    sage: {
        50: '#F6F9F4',
        100: '#E8F0E3',
        200: '#D4E4CA',
        300: '#B5D1A4',
        400: '#8FB87A',
        500: '#6B9B59',
        600: '#537A45',
        700: '#425F38',
        800: '#374D30',
        900: '#2F4029',
    },
    // Terracotta/Warm Orange - Accent (energy, warmth)
    terracotta: {
        50: '#FEF6F3',
        100: '#FCEAE3',
        200: '#FAD5C7',
        300: '#F5B49D',
        400: '#ED8B6B',
        500: '#E2714D',
        600: '#C85A3A',
        700: '#A64830',
        800: '#873D2C',
        900: '#6F3528',
    },
    // Cream/Beige - Backgrounds (warm, organic)
    cream: {
        50: '#FEFDFB',
        100: '#FDF9F3',
        200: '#FAF3E8',
        300: '#F5EAD6',
        400: '#EDDDC0',
        500: '#E3CBAA',
        600: '#D4B48D',
        700: '#BF9A6B',
        800: '#A27F52',
        900: '#856642',
    },
    // Earth tones for text
    earth: {
        50: '#FAF9F7',
        100: '#F3F1ED',
        200: '#E8E4DD',
        300: '#D5CFC5',
        400: '#B8AFA2',
        500: '#918778',
        600: '#716859',
        700: '#574F43',
        800: '#3E3830',
        900: '#2A2621',
    },
    // Energy score gradient
    energyGradient: {
        1: '#C85A3A',
        2: '#E2714D',
        3: '#ED8B6B',
        4: '#F5B49D',
        5: '#E3CBAA',
        6: '#B5D1A4',
        7: '#8FB87A',
        8: '#6B9B59',
        9: '#537A45',
        10: '#425F38',
    } as Record<number, string>,
};

// Energy color based on score
const getEnergyColor = (score: number): string => {
    const index = Math.min(Math.max(Math.round(score), 1), 10);
    return NatureColors.energyGradient[index];
};

// Get energy label with nature metaphor
const getEnergyLabel = (score: number): { emoji: string; text: string } => {
    if (score >= 8) return { emoji: '🌳', text: 'Flourishing' };
    if (score >= 6) return { emoji: '🌿', text: 'Growing Strong' };
    if (score >= 4) return { emoji: '🌱', text: 'Steady Ground' };
    return { emoji: '🍂', text: 'Rest & Restore' };
};

interface DayData {
    date: string;
    score: number | null;
    checkInCount: number;
    morning: boolean;
    midday: boolean;
    evening: boolean;
}

interface WeeklyStats {
    averageScore: number;
    totalCheckIns: number;
    daysWithData: number;
    bestDay: string | null;
    worstDay: string | null;
    scoreChange: number;
}

interface WeeklyData {
    days: DayData[];
    stats: WeeklyStats;
}

// New aha-moment card types
interface InsightCard {
    type: 'drain' | 'booster';
    title: string;
    emoji: string;
    frequency: string;
    context: string;
    impact: string;
    action: string;
}

interface WeeklyExperiment {
    focus: string;
    emoji: string;
    goal: string;
    action: string;
    howTo: string;
    commitment: string;
    checkInDay: string;
}

interface TodayCard {
    title: string;
    emoji: string;
    why: string;
    action: string;
    when: string;
    benefit: string;
}

interface AhaCards {
    drainCard: InsightCard | null;
    boosterCard: InsightCard | null;
    todayCard: TodayCard | null;
    experiment: WeeklyExperiment;
    hasEnoughData: boolean;
}

// Discovery Moment Card interface
interface DiscoveryPattern {
    id: string;
    type: 'drain' | 'booster' | 'insight';
    emoji: string;
    title: string;
    pattern: string;
    frequency?: string;
    impact?: string;
    isNew: boolean;
}

export default function InsightsScreen() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [weeklyData, setWeeklyData] = useState<WeeklyData | null>(null);
    const [patterns, setPatterns] = useState<string[]>([]);
    const [ahaCards, setAhaCards] = useState<AhaCards | null>(null);
    const [activeTab, setActiveTab] = useState<'week' | 'patterns' | 'history'>('week');
    const [checkInHistory, setCheckInHistory] = useState<Record<string, unknown>[]>([]);

    // Discovery Moments state
    const [revealedCards, setRevealedCards] = useState<Set<string>>(new Set());
    const [discoveryPatterns, setDiscoveryPatterns] = useState<DiscoveryPattern[]>([]);

    // History detail modal state
    const [selectedCheckIn, setSelectedCheckIn] = useState<Record<string, unknown> | null>(null);
    const [showCheckInModal, setShowCheckInModal] = useState(false);
    const [showHistoryModal, setShowHistoryModal] = useState(false);

    // Calendar / Meeting Patterns state
    const [calendarEnabled, setCalendarEnabledState] = useState(false);
    const [weekCalendarData, setWeekCalendarData] = useState<DailyCognitiveLoad[]>([]);
    const [calendarLoading, setCalendarLoading] = useState(false);

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [])
    );

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

            // Fetch weekly insights
            const weeklyResponse = await fetch(`${API_URL}/insights/weekly`, { headers });
            if (weeklyResponse.ok) {
                const weeklyResult = await weeklyResponse.json();
                if (weeklyResult.success) {
                    setWeeklyData(weeklyResult.data);
                }
            }

            // Fetch patterns
            const patternsResponse = await fetch(`${API_URL}/insights/patterns`, { headers });
            if (patternsResponse.ok) {
                const patternsResult = await patternsResponse.json();
                if (patternsResult.success) {
                    setPatterns(patternsResult.data.patterns);
                }
            }

            // Fetch aha-moment cards for Patterns tab
            const ahaResponse = await fetch(`${API_URL}/insights/aha-cards`, { headers });
            if (ahaResponse.ok) {
                const ahaResult = await ahaResponse.json();
                if (ahaResult.success) {
                    setAhaCards(ahaResult.data);

                    // Generate discovery patterns from aha cards
                    const newPatterns: DiscoveryPattern[] = [];

                    if (ahaResult.data.drainCard) {
                        newPatterns.push({
                            id: 'drain-1',
                            type: 'drain',
                            emoji: ahaResult.data.drainCard.emoji || '🌧️',
                            title: 'Drain Pattern Discovered!',
                            pattern: ahaResult.data.drainCard.title,
                            frequency: ahaResult.data.drainCard.frequency,
                            impact: ahaResult.data.drainCard.impact,
                            isNew: true,
                        });
                    }

                    if (ahaResult.data.boosterCard) {
                        newPatterns.push({
                            id: 'booster-1',
                            type: 'booster',
                            emoji: ahaResult.data.boosterCard.emoji || '⚡',
                            title: 'Energy Booster Found!',
                            pattern: ahaResult.data.boosterCard.title,
                            frequency: ahaResult.data.boosterCard.frequency,
                            impact: ahaResult.data.boosterCard.impact,
                            isNew: true,
                        });
                    }

                    // Add insight pattern from today card
                    if (ahaResult.data.todayCard) {
                        newPatterns.push({
                            id: 'insight-1',
                            type: 'insight',
                            emoji: ahaResult.data.todayCard.emoji || '💡',
                            title: 'Today\'s Insight',
                            pattern: ahaResult.data.todayCard.title,
                            impact: ahaResult.data.todayCard.benefit,
                            isNew: false,
                        });
                    }

                    setDiscoveryPatterns(newPatterns);
                }
            }

            // Fetch history
            const historyResponse = await fetch(`${API_URL}/insights/history?limit=30`, { headers });
            if (historyResponse.ok) {
                const historyResult = await historyResponse.json();
                if (historyResult.success) {
                    setCheckInHistory(historyResult.data.checkIns || []);
                }
            }

            // Fetch calendar week data if enabled
            const calEnabled = await isCalendarEnabled();
            setCalendarEnabledState(calEnabled);
            if (calEnabled) {
                setCalendarLoading(true);
                try {
                    await syncWeekCalendarData();
                    const calData = await fetchWeekCalendarData();
                    setWeekCalendarData(calData);
                } catch (calErr) {
                    console.error('Calendar fetch error:', calErr);
                } finally {
                    setCalendarLoading(false);
                }
            }
        } catch (err) {
            console.error('Error loading insights:', err);
        } finally {
            setLoading(false);
        }
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    };

    const getEnergyColor = (score: number): string => {
        const index = Math.min(Math.max(Math.round(score), 1), 10) as keyof typeof Colors.energy;
        return Colors.energy[index];
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

    const formatDayName = (dateStr: string): string => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { weekday: 'short' });
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Colors.primary[500]} />
                <Text style={styles.loadingText}>Loading insights...</Text>
            </View>
        );
    }

    const hasData = weeklyData && weeklyData.stats.totalCheckIns > 0;

    // Get energy label with nature metaphor
    const getEnergyLabel = (score: number): { emoji: string; text: string } => {
        if (score >= 8) return { emoji: '🌳', text: 'Flourishing' };
        if (score >= 6) return { emoji: '🌿', text: 'Growing Strong' };
        if (score >= 4) return { emoji: '🌱', text: 'Steady Ground' };
        return { emoji: '🍂', text: 'Rest & Restore' };
    };

    // Group check-ins by date for history display
    const getGroupedHistory = () => {
        const grouped: { [date: string]: Record<string, unknown>[] } = {};
        checkInHistory.slice(0, 15).forEach(checkIn => {
            const date = new Date(checkIn.created_at as string).toISOString().split('T')[0];
            if (!grouped[date]) grouped[date] = [];
            grouped[date].push(checkIn);
        });
        return grouped;
    };

    const groupedHistory = getGroupedHistory();

    return (
        <>
            <ScrollView
                style={styles.container}
                contentContainerStyle={styles.content}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary[500]} />}
            >
                {/* Header with gradient feel */}
                <View style={styles.header}>
                    <View style={styles.headerTop}>
                        <View>
                            <Text style={styles.title}>Insights</Text>
                            <Text style={styles.subtitle}>Your energy journey this week</Text>
                        </View>
                        <TouchableOpacity 
                            style={styles.historyBtn}
                            onPress={() => setShowHistoryModal(true)}
                        >
                            <Text style={styles.historyBtnIcon}>📋</Text>
                            <Text style={styles.historyBtnText}>History</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {!hasData ? (
                    <View style={styles.emptyState}>
                        <View style={styles.emptyIconWrap}>
                            <Text style={styles.emptyEmoji}>🌱</Text>
                        </View>
                        <Text style={styles.emptyTitle}>Your Journey Awaits</Text>
                        <Text style={styles.emptyText}>
                            Complete your daily check-ins to unlock personalized insights and discover your energy patterns.
                        </Text>
                        <TouchableOpacity style={styles.emptyButton} onPress={() => router.push('/check-in?type=morning')}>
                            <Text style={styles.emptyButtonText}>Start First Check-in</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <>
                        {/* Tab Toggle */}
                        <View style={styles.tabToggle}>
                            <TouchableOpacity
                                style={[styles.tabBtn, activeTab === 'week' && styles.tabBtnActive]}
                                onPress={() => setActiveTab('week')}
                            >
                                <Text style={[styles.tabBtnText, activeTab === 'week' && styles.tabBtnTextActive]}>
                                    📊 Week
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.tabBtn, activeTab === 'patterns' && styles.tabBtnActive]}
                                onPress={() => setActiveTab('patterns')}
                            >
                                <Text style={[styles.tabBtnText, activeTab === 'patterns' && styles.tabBtnTextActive]}>
                                    ✨ Patterns
                                </Text>
                            </TouchableOpacity>
                        </View>

                        {activeTab === 'week' ? (
                            <>
                        {/* ═══════════════════════════════════════════════════════════ */}
                        {/* WEEKLY ENERGY HERO - Redesigned */}
                        {/* ═══════════════════════════════════════════════════════════ */}
                        <View style={styles.weeklyHero}>
                            {/* Main Score Display */}
                            <View style={styles.weeklyScoreSection}>
                                <View style={styles.weeklyScoreCircle}>
                                    <Text style={styles.weeklyScoreValue}>
                                        {weeklyData!.stats.averageScore.toFixed(1)}
                                    </Text>
                                    <Text style={styles.weeklyScoreLabel}>avg</Text>
                                </View>
                                <View style={styles.weeklyScoreInfo}>
                                    <Text style={styles.weeklyScoreTitle}>This Week's Energy</Text>
                                    <View style={styles.weeklyStatus}>
                                        <Text style={styles.weeklyStatusEmoji}>
                                            {getEnergyLabel(weeklyData!.stats.averageScore).emoji}
                                        </Text>
                                        <Text style={styles.weeklyStatusText}>
                                            {getEnergyLabel(weeklyData!.stats.averageScore).text}
                                        </Text>
                                    </View>
                                    {/* Change indicator */}
                                    <View style={[
                                        styles.weeklyChange,
                                        weeklyData!.stats.scoreChange >= 0 ? styles.weeklyChangeUp : styles.weeklyChangeDown
                                    ]}>
                                        <Text style={[
                                            styles.weeklyChangeText,
                                            weeklyData!.stats.scoreChange >= 0 ? styles.weeklyChangeTextUp : styles.weeklyChangeTextDown
                                        ]}>
                                            {weeklyData!.stats.scoreChange >= 0 ? '↑' : '↓'} {Math.abs(weeklyData!.stats.scoreChange).toFixed(1)} vs last week
                                        </Text>
                                    </View>
                                </View>
                            </View>

                            {/* Quick Stats Grid */}
                            <View style={styles.quickStatsGrid}>
                                <View style={styles.quickStat}>
                                    <View style={[styles.quickStatIcon, { backgroundColor: Colors.primary[100] }]}>
                                        <Text style={styles.quickStatEmoji}>✓</Text>
                                    </View>
                                    <Text style={styles.quickStatValue}>{weeklyData!.stats.totalCheckIns}</Text>
                                    <Text style={styles.quickStatLabel}>Check-ins</Text>
                                </View>
                                <View style={styles.quickStat}>
                                    <View style={[styles.quickStatIcon, { backgroundColor: Colors.success[100] }]}>
                                        <Text style={styles.quickStatEmoji}>📅</Text>
                                    </View>
                                    <Text style={styles.quickStatValue}>{weeklyData!.stats.daysWithData}</Text>
                                    <Text style={styles.quickStatLabel}>Days Active</Text>
                                </View>
                                <View style={styles.quickStat}>
                                    <View style={[styles.quickStatIcon, { backgroundColor: Colors.warning[100] }]}>
                                        <Text style={styles.quickStatEmoji}>⭐</Text>
                                    </View>
                                    <Text style={styles.quickStatValue}>
                                        {weeklyData!.stats.bestDay
                                            ? new Date(weeklyData!.stats.bestDay).toLocaleDateString('en-US', { weekday: 'short' })
                                            : '-'}
                                    </Text>
                                    <Text style={styles.quickStatLabel}>Best Day</Text>
                                </View>
                            </View>
                        </View>

                        {/* ═══════════════════════════════════════════════════════════ */}
                        {/* ENERGY FLOW CHART - Simplified */}
                        {/* ═══════════════════════════════════════════════════════════ */}
                        <View style={styles.chartCard}>
                            <View style={styles.chartHeader}>
                                <Text style={styles.chartTitle}>Energy Flow</Text>
                                <Text style={styles.chartPeriod}>Last 7 days</Text>
                            </View>
                            
                            {/* Simple Bar Chart */}
                            <View style={styles.simpleChart}>
                                {weeklyData!.days.map((day, index) => {
                                    const score = day.score || 0;
                                    const heightPercent = (score / 10) * 100;
                                    const isToday = day.date === new Date().toISOString().split('T')[0];
                                    
                                    return (
                                        <View key={day.date} style={styles.chartColumn}>
                                            <View style={styles.chartBarWrapper}>
                                                <View style={[
                                                    styles.chartBar,
                                                    {
                                                        height: `${Math.max(heightPercent, 8)}%`,
                                                        backgroundColor: day.score ? getEnergyColor(day.score) : Colors.neutral[200],
                                                    },
                                                    isToday && styles.chartBarToday
                                                ]}>
                                                    {day.score && (
                                                        <Text style={styles.chartBarValue}>{day.score.toFixed(0)}</Text>
                                                    )}
                                                </View>
                                            </View>
                                            <Text style={[styles.chartDayLabel, isToday && styles.chartDayLabelToday]}>
                                                {isToday ? 'Today' : formatDayName(day.date)}
                                            </Text>
                                        </View>
                                    );
                                })}
                            </View>
                        </View>

                        {/* ═══════════════════════════════════════════════════════════ */}
                        {/* WEEKLY MEETING PATTERNS - Calendar Integration */}
                        {/* ═══════════════════════════════════════════════════════════ */}
                        {calendarEnabled && weekCalendarData.length > 0 && (
                            <View style={calendarInsightStyles.meetingCard}>
                                <View style={calendarInsightStyles.cardHeader}>
                                    <View style={calendarInsightStyles.cardIconContainer}>
                                        <Text style={calendarInsightStyles.cardIcon}>📊</Text>
                                    </View>
                                    <View style={calendarInsightStyles.cardHeaderText}>
                                        <Text style={calendarInsightStyles.cardTitle}>Weekly Meeting Patterns</Text>
                                        <Text style={calendarInsightStyles.cardSubtitle}>Last 7 days overview</Text>
                                    </View>
                                </View>

                                {/* Professional Bar Chart with Grid */}
                                <View style={calendarInsightStyles.chartWrapper}>
                                    {/* Y-axis labels */}
                                    <View style={calendarInsightStyles.yAxis}>
                                        {[8, 6, 4, 2, 0].map((value) => (
                                            <Text key={value} style={calendarInsightStyles.yAxisLabel}>{value}h</Text>
                                        ))}
                                    </View>
                                    
                                    {/* Chart area */}
                                    <View style={calendarInsightStyles.chartArea}>
                                        {/* Grid lines */}
                                        <View style={calendarInsightStyles.gridLines}>
                                            {[0, 1, 2, 3, 4].map((i) => (
                                                <View key={i} style={calendarInsightStyles.gridLine} />
                                            ))}
                                        </View>
                                        
                                        {/* Bars */}
                                        <View style={calendarInsightStyles.barsContainer}>
                                            {weekCalendarData.map((day, index) => {
                                                const maxHours = 8;
                                                const barHeightPercent = Math.min((day.metrics.meetingHours / maxHours) * 100, 100);
                                                const loadScore = getCognitiveLoadScore(day.metrics);
                                                const loadInfo = getCognitiveLoadLabel(loadScore);
                                                const isToday = day.date === new Date().toISOString().split('T')[0];
                                                const dayName = new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
                                                
                                                // Find max for highlighting
                                                const allHours = weekCalendarData.map(d => d.metrics.meetingHours);
                                                const maxMeetingHours = Math.max(...allHours);
                                                const minMeetingHours = Math.min(...allHours.filter(h => h >= 0));
                                                const isWorst = day.metrics.meetingHours === maxMeetingHours && maxMeetingHours > 0;
                                                const isBest = day.metrics.meetingHours === minMeetingHours && 
                                                    minMeetingHours < maxMeetingHours && 
                                                    weekCalendarData.some(d => d.metrics.meetingHours > 0);

                                                return (
                                                    <View key={day.date} style={calendarInsightStyles.barColumn}>
                                                        {/* Bar container with fixed height */}
                                                        <View style={calendarInsightStyles.barContainer}>
                                                            <View 
                                                                style={[
                                                                    calendarInsightStyles.bar,
                                                                    {
                                                                        height: `${Math.max(barHeightPercent, 2)}%`,
                                                                        backgroundColor: isToday ? Colors.primary[500] : loadInfo.color,
                                                                    },
                                                                ]}
                                                            >
                                                                {/* Value label on top of bar */}
                                                                {day.metrics.meetingHours > 0 && (
                                                                    <Text style={calendarInsightStyles.barValueLabel}>
                                                                        {day.metrics.meetingHours.toFixed(1)}
                                                                    </Text>
                                                                )}
                                                            </View>
                                                        </View>
                                                        
                                                        {/* Day label */}
                                                        <Text style={[
                                                            calendarInsightStyles.barDayLabel,
                                                            isToday && calendarInsightStyles.barDayLabelToday,
                                                        ]}>
                                                            {isToday ? 'Today' : dayName}
                                                        </Text>
                                                        
                                                        {/* Badge */}
                                                        {(isWorst || isBest) && (
                                                            <View style={[
                                                                calendarInsightStyles.barBadge,
                                                                isWorst && calendarInsightStyles.barBadgeWorst,
                                                                isBest && calendarInsightStyles.barBadgeBest,
                                                            ]}>
                                                                <Text style={calendarInsightStyles.barBadgeText}>
                                                                    {isWorst ? '⚠️' : '✨'}
                                                                </Text>
                                                            </View>
                                                        )}
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    </View>
                                </View>

                                {/* Weekly stats summary */}
                                <View style={calendarInsightStyles.weeklyStats}>
                                    {(() => {
                                        const totalHours = weekCalendarData.reduce((sum, d) => sum + d.metrics.meetingHours, 0);
                                        const totalMeetings = weekCalendarData.reduce((sum, d) => sum + d.metrics.meetingCount, 0);
                                        const avgHours = totalHours / 7;
                                        
                                        // Find best and worst days
                                        let bestDay = '';
                                        let worstDay = '';
                                        let minHours = Infinity;
                                        let maxHours = 0;
                                        
                                        weekCalendarData.forEach(d => {
                                            if (d.metrics.meetingHours < minHours) {
                                                minHours = d.metrics.meetingHours;
                                                bestDay = new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });
                                            }
                                            if (d.metrics.meetingHours > maxHours) {
                                                maxHours = d.metrics.meetingHours;
                                                worstDay = new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });
                                            }
                                        });

                                        return (
                                            <View style={calendarInsightStyles.statsGrid}>
                                                <View style={calendarInsightStyles.statBox}>
                                                    <Text style={calendarInsightStyles.statBoxValue}>{totalHours.toFixed(1)}h</Text>
                                                    <Text style={calendarInsightStyles.statBoxLabel}>Total</Text>
                                                </View>
                                                <View style={calendarInsightStyles.statBox}>
                                                    <Text style={calendarInsightStyles.statBoxValue}>{totalMeetings}</Text>
                                                    <Text style={calendarInsightStyles.statBoxLabel}>Meetings</Text>
                                                </View>
                                                <View style={calendarInsightStyles.statBox}>
                                                    <Text style={calendarInsightStyles.statBoxValue}>{avgHours.toFixed(1)}h</Text>
                                                    <Text style={calendarInsightStyles.statBoxLabel}>Daily Avg</Text>
                                                </View>
                                                <View style={calendarInsightStyles.statBox}>
                                                    <Text style={[calendarInsightStyles.statBoxValue, { color: Colors.primary[600] }]}>
                                                        {bestDay?.slice(0, 3) || '—'}
                                                    </Text>
                                                    <Text style={calendarInsightStyles.statBoxLabel}>Lightest</Text>
                                                </View>
                                            </View>
                                        );
                                    })()}
                                </View>
                            </View>
                        )}

                        {/* ═══════════════════════════════════════════════════════════ */}
                        {/* CALENDAR-ENERGY CORRELATION CARD */}
                        {/* ═══════════════════════════════════════════════════════════ */}
                        {calendarEnabled && weekCalendarData.length > 0 && weeklyData && weeklyData.days.length > 0 && (
                            <View style={calendarInsightStyles.correlationCard}>
                                <View style={calendarInsightStyles.cardHeader}>
                                    <View style={calendarInsightStyles.cardIconContainer}>
                                        <Text style={calendarInsightStyles.cardIcon}>🔗</Text>
                                    </View>
                                    <View style={calendarInsightStyles.cardHeaderText}>
                                        <Text style={calendarInsightStyles.cardTitle}>Meeting Load vs Energy</Text>
                                        <Text style={calendarInsightStyles.cardSubtitle}>Correlation analysis</Text>
                                    </View>
                                </View>

                                {(() => {
                                    // Calculate correlation between meeting hours and energy scores
                                    const daysWithBoth = weeklyData.days.filter(d => d.score !== null).map(d => {
                                        const calDay = weekCalendarData.find(c => c.date === d.date);
                                        return {
                                            date: d.date,
                                            energy: d.score || 0,
                                            meetingHours: calDay?.metrics.meetingHours || 0,
                                        };
                                    }).filter(d => d.energy > 0);

                                    if (daysWithBoth.length < 3) {
                                        return (
                                            <View style={calendarInsightStyles.correlationEmpty}>
                                                <View style={correlationStyles.emptyStateIcon}>
                                                    <Text style={{ fontSize: 32 }}>📊</Text>
                                                </View>
                                                <Text style={correlationStyles.emptyStateTitle}>
                                                    Gathering Data
                                                </Text>
                                                <Text style={calendarInsightStyles.correlationEmptyText}>
                                                    Complete more check-ins to see how meetings affect your energy.
                                                </Text>
                                            </View>
                                        );
                                    }

                                    // Calculate average energy on heavy vs light meeting days
                                    const heavyDays = daysWithBoth.filter(d => d.meetingHours >= 4);
                                    const lightDays = daysWithBoth.filter(d => d.meetingHours < 2);
                                    
                                    const heavyAvg = heavyDays.length > 0 
                                        ? heavyDays.reduce((sum, d) => sum + d.energy, 0) / heavyDays.length 
                                        : 0;
                                    const lightAvg = lightDays.length > 0 
                                        ? lightDays.reduce((sum, d) => sum + d.energy, 0) / lightDays.length 
                                        : 0;
                                    
                                    const energyDrop = lightAvg - heavyAvg;

                                    if (heavyDays.length === 0 || lightDays.length === 0) {
                                        return (
                                            <View style={calendarInsightStyles.correlationContent}>
                                                <View style={correlationStyles.infoBox}>
                                                    <Text style={correlationStyles.infoIcon}>📊</Text>
                                                    <Text style={correlationStyles.infoText}>
                                                        Not enough variety in meeting loads yet to identify a pattern.
                                                    </Text>
                                                </View>
                                                <View style={calendarInsightStyles.tipBox}>
                                                    <Text style={calendarInsightStyles.tipEmoji}>💡</Text>
                                                    <Text style={calendarInsightStyles.tipText}>
                                                        Keep tracking to discover how your meeting schedule affects your energy!
                                                    </Text>
                                                </View>
                                            </View>
                                        );
                                    }

                                    // Determine correlation type
                                    const isNegativeCorrelation = energyDrop > 0.5;
                                    const isPositiveCorrelation = energyDrop < -0.5;

                                    return (
                                        <View style={calendarInsightStyles.correlationContent}>
                                            {/* Visual Comparison */}
                                            <View style={correlationStyles.comparisonContainer}>
                                                <View style={correlationStyles.comparisonItem}>
                                                    <View style={[correlationStyles.energyCircle, { backgroundColor: NatureColors.sage[100] }]}>
                                                        <Text style={[correlationStyles.energyValue, { color: NatureColors.sage[700] }]}>
                                                            {lightAvg.toFixed(1)}
                                                        </Text>
                                                    </View>
                                                    <Text style={correlationStyles.comparisonLabel}>Light Days</Text>
                                                    <Text style={correlationStyles.comparisonSubLabel}>&lt; 2h meetings</Text>
                                                </View>
                                                
                                                <View style={correlationStyles.arrowContainer}>
                                                    <Text style={correlationStyles.arrowText}>
                                                        {isNegativeCorrelation ? '↓' : isPositiveCorrelation ? '↑' : '='}
                                                    </Text>
                                                    <Text style={[
                                                        correlationStyles.diffText,
                                                        isNegativeCorrelation && { color: NatureColors.terracotta[500] },
                                                        isPositiveCorrelation && { color: NatureColors.sage[600] },
                                                    ]}>
                                                        {isNegativeCorrelation 
                                                            ? `-${energyDrop.toFixed(1)}` 
                                                            : isPositiveCorrelation 
                                                                ? `+${Math.abs(energyDrop).toFixed(1)}`
                                                                : '~0'
                                                        }
                                                    </Text>
                                                </View>
                                                
                                                <View style={correlationStyles.comparisonItem}>
                                                    <View style={[correlationStyles.energyCircle, { backgroundColor: NatureColors.terracotta[100] }]}>
                                                        <Text style={[correlationStyles.energyValue, { color: NatureColors.terracotta[700] }]}>
                                                            {heavyAvg.toFixed(1)}
                                                        </Text>
                                                    </View>
                                                    <Text style={correlationStyles.comparisonLabel}>Heavy Days</Text>
                                                    <Text style={correlationStyles.comparisonSubLabel}>4h+ meetings</Text>
                                                </View>
                                            </View>

                                            {/* Pattern Discovery */}
                                            <View style={correlationStyles.patternBox}>
                                                <View style={correlationStyles.patternHeader}>
                                                    <Text style={correlationStyles.patternIcon}>
                                                        {isNegativeCorrelation ? '📉' : isPositiveCorrelation ? '📈' : '📊'}
                                                    </Text>
                                                    <Text style={correlationStyles.patternTitle}>Pattern Discovered</Text>
                                                </View>
                                                <Text style={correlationStyles.patternDescription}>
                                                    {isNegativeCorrelation 
                                                        ? `Your energy drops ${energyDrop.toFixed(1)} points on days with 4+ hours of meetings.`
                                                        : isPositiveCorrelation
                                                            ? `Interestingly, busy meeting days seem to energize you (+${Math.abs(energyDrop).toFixed(1)} points)!`
                                                            : `Meetings don't seem to significantly affect your energy levels.`
                                                    }
                                                </Text>
                                            </View>

                                            {/* Action Tip */}
                                            <View style={calendarInsightStyles.tipBox}>
                                                <Text style={calendarInsightStyles.tipEmoji}>💡</Text>
                                                <View style={correlationStyles.tipContent}>
                                                    <Text style={correlationStyles.tipTitle}>Try This Week</Text>
                                                    <Text style={calendarInsightStyles.tipText}>
                                                        {isNegativeCorrelation
                                                            ? "Block 30 min after long meeting blocks for recovery time."
                                                            : isPositiveCorrelation
                                                                ? "You thrive on collaboration! Schedule creative work after meetings."
                                                                : "Your energy is consistent. Great resilience!"
                                                        }
                                                    </Text>
                                                </View>
                                            </View>
                                        </View>
                                    );
                                })()}
                            </View>
                        )}
                            </>
                        ) : (
                            <>
                        {/* ═══════════════════════════════════════════════════════════ */}
                        {/* PATTERNS TAB CONTENT */}
                        {/* ═══════════════════════════════════════════════════════════ */}
                        
                        {/* Discovery Pattern Cards Section */}
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>✨ Discovery Moments</Text>
                            <Text style={styles.sectionSubtitle}>Tap to reveal your patterns</Text>
                        </View>

                        {discoveryPatterns.length > 0 ? (
                            <>
                                {/* Discovery Pattern Cards */}
                                {discoveryPatterns.map((pattern) => {
                                    const isRevealed = revealedCards.has(pattern.id);

                                    return (
                                        <TouchableOpacity
                                            key={pattern.id}
                                            activeOpacity={0.9}
                                            onPress={() => {
                                                if (!isRevealed) {
                                                    setRevealedCards(prev => new Set([...prev, pattern.id]));
                                                }
                                            }}
                                        >
                                            {!isRevealed ? (

                                                /* Folded Card State */
                                                <View style={[
                                                    styles.discoveryCardFolded,
                                                    pattern.type === 'drain' && styles.discoveryCardFoldedDrain,
                                                    pattern.type === 'booster' && styles.discoveryCardFoldedBooster,
                                                    pattern.type === 'insight' && styles.discoveryCardFoldedInsight,
                                                ]}>
                                                    <View style={styles.foldedContent}>
                                                        <View style={styles.tapPrompt}>
                                                            <Text style={styles.tapIcon}>👆</Text>
                                                            <Text style={styles.tapText}>Tap to unfold</Text>
                                                        </View>
                                                        <View style={styles.foldedMain}>
                                                            <Text style={styles.foldedEmoji}>{pattern.emoji}</Text>
                                                            <Text style={[
                                                                styles.foldedTitle,
                                                                pattern.type === 'drain' && styles.foldedTitleDrain,
                                                                pattern.type === 'booster' && styles.foldedTitleBooster,
                                                            ]}>
                                                                {pattern.title}
                                                            </Text>
                                                        </View>
                                                        {pattern.isNew && (
                                                            <View style={styles.newBadge}>
                                                                <Text style={styles.newBadgeText}>NEW</Text>
                                                            </View>
                                                        )}
                                                    </View>
                                                    <View style={styles.foldedHint}>
                                                        <Text style={styles.foldedHintText}>
                                                            {pattern.type === 'drain' ? '🌧️ Something is draining your energy...' :
                                                                pattern.type === 'booster' ? '⚡ You found something that energizes you!' :
                                                                    '💡 A personalized insight awaits...'}
                                                        </Text>
                                                    </View>
                                                </View>
                                            ) : (
                                                /* Revealed Card State */
                                                <View style={[
                                                    styles.discoveryCardRevealed,
                                                    pattern.type === 'drain' && styles.discoveryCardRevealedDrain,
                                                    pattern.type === 'booster' && styles.discoveryCardRevealedBooster,
                                                    pattern.type === 'insight' && styles.discoveryCardRevealedInsight,
                                                ]}>
                                                    <View style={styles.revealedHeader}>
                                                        <Text style={styles.revealedEmoji}>{pattern.emoji}</Text>
                                                        <Text style={[
                                                            styles.revealedTitle,
                                                            pattern.type === 'drain' && styles.revealedTitleDrain,
                                                            pattern.type === 'booster' && styles.revealedTitleBooster,
                                                        ]}>
                                                            {pattern.title}
                                                        </Text>
                                                    </View>

                                                    <View style={styles.patternQuote}>
                                                        <Text style={styles.patternQuoteText}>"{pattern.pattern}"</Text>
                                                    </View>

                                                    {pattern.frequency && (
                                                        <View style={styles.revealedRow}>
                                                            <Text style={styles.revealedIcon}>📅</Text>
                                                            <Text style={styles.revealedText}>{pattern.frequency}</Text>
                                                        </View>
                                                    )}

                                                    {pattern.impact && (
                                                        <View style={styles.revealedRow}>
                                                            <Text style={styles.revealedIcon}>🎯</Text>
                                                            <Text style={styles.revealedText}>{pattern.impact}</Text>
                                                        </View>
                                                    )}

                                                    <View style={styles.revealedActions}>
                                                        <TouchableOpacity
                                                            style={styles.actionButtonPrimary}
                                                            onPress={async () => {
                                                                if (pattern.type === 'drain') {
                                                                    // Set reminder for drain pattern
                                                                    const scheduled = await schedulePatternReminder({
                                                                        title: pattern.pattern,
                                                                        emoji: pattern.emoji,
                                                                        type: pattern.type,
                                                                    });

                                                                    if (scheduled) {
                                                                        // Send immediate confirmation
                                                                        await sendImmediatePatternReminder({
                                                                            title: pattern.pattern,
                                                                            emoji: pattern.emoji,
                                                                            type: pattern.type,
                                                                        });

                                                                        Alert.alert(
                                                                            '🔔 Reminder Set!',
                                                                            `We'll remind you daily at 2:00 PM to avoid this energy drain.`,
                                                                            [{ text: 'Got it', style: 'default' }]
                                                                        );

                                                                        // Close the card
                                                                        setRevealedCards(prev => {
                                                                            const newSet = new Set(prev);
                                                                            newSet.delete(pattern.id);
                                                                            return newSet;
                                                                        });
                                                                    } else {
                                                                        Alert.alert(
                                                                            'Notifications Required',
                                                                            'Please enable notifications in Settings to set reminders.',
                                                                            [{ text: 'OK' }]
                                                                        );
                                                                    }
                                                                } else {
                                                                    // Learn More - for booster patterns
                                                                    Alert.alert(
                                                                        `${pattern.emoji} ${pattern.title}`,
                                                                        `${pattern.pattern}\n\n${pattern.impact || 'Keep doing this to maintain high energy levels!'}`,
                                                                        [{ text: 'Got it!', style: 'default' }]
                                                                    );
                                                                }
                                                            }}
                                                        >
                                                            <Text style={styles.actionButtonPrimaryText}>
                                                                {pattern.type === 'drain' ? '🔔 Set Reminder' : '📝 Learn More'}
                                                            </Text>
                                                        </TouchableOpacity>
                                                        <TouchableOpacity
                                                            style={styles.actionButtonSecondary}
                                                            onPress={() => {
                                                                setRevealedCards(prev => {
                                                                    const newSet = new Set(prev);
                                                                    newSet.delete(pattern.id);
                                                                    return newSet;
                                                                });
                                                            }}
                                                        >
                                                            <Text style={styles.actionButtonSecondaryText}>
                                                                {pattern.type === 'drain' ? '❌ Dismiss' : '✅ Got It'}
                                                            </Text>
                                                        </TouchableOpacity>
                                                    </View>
                                                </View>
                                            )}
                                        </TouchableOpacity>
                                    );
                                })}

                                {/* Weekly Experiment Card - Always visible */}
                                {ahaCards?.experiment && (
                                    <View style={styles.experimentCard}>
                                        <View style={styles.cardHeader}>
                                            <Text style={styles.cardEmoji}>🧪</Text>
                                            <Text style={styles.experimentLabel}>This Week's Experiment</Text>
                                        </View>
                                        <Text style={styles.experimentTitle}>
                                            {ahaCards.experiment.emoji} {ahaCards.experiment.focus}
                                        </Text>

                                        <View style={styles.insightRow}>
                                            <Text style={styles.insightIcon}>🎯</Text>
                                            <Text style={styles.insightText}>{ahaCards.experiment.goal}</Text>
                                        </View>
                                        <View style={styles.insightRow}>
                                            <Text style={styles.insightIcon}>🛠️</Text>
                                            <Text style={styles.insightText}>{ahaCards.experiment.action}</Text>
                                        </View>

                                        <View style={styles.commitmentBox}>
                                            <Text style={styles.commitmentText}>
                                                📅 {ahaCards.experiment.commitment}
                                            </Text>
                                            <Text style={styles.checkInText}>
                                                ✅ Check-in on {ahaCards.experiment.checkInDay}
                                            </Text>
                                        </View>
                                    </View>
                                )}
                            </>
                        ) : (
                            /* Empty state for patterns */
                            <View style={styles.emptyPatterns}>
                                <Text style={styles.emptyEmoji}>🔍</Text>
                                <Text style={styles.emptyTitle}>Building Your Profile</Text>
                                <Text style={styles.emptyText}>
                                    Complete more check-ins this week to discover your patterns and unlock discovery moments.
                                </Text>
                            </View>
                        )}
                            </>
                        )}
                    </>
                )}
            </ScrollView>

            {/* Check-in Detail Modal */}
            <Modal
                visible={showCheckInModal}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setShowCheckInModal(false)}
            >
                <Pressable
                    style={styles.modalOverlay}
                    onPress={() => setShowCheckInModal(false)}
                >
                    <Pressable
                        style={styles.modalContent}
                        onPress={(e) => e.stopPropagation()}
                    >
                        {selectedCheckIn && (
                            <>
                                {/* Modal Header */}
                                <View style={styles.modalHeader}>
                                    <View style={styles.modalHeaderLeft}>
                                        <Text style={styles.modalEmoji}>
                                            {selectedCheckIn.type === 'morning' ? '🌅' :
                                                selectedCheckIn.type === 'midday' ? '☀️' : '🌙'}
                                        </Text>
                                        <View>
                                            <Text style={styles.modalTitle}>
                                                {selectedCheckIn.type === 'morning' ? 'Morning Check-in' :
                                                    selectedCheckIn.type === 'midday' ? 'Mid-day Pulse' : 'Evening Reflection'}
                                            </Text>
                                            <Text style={styles.modalDate}>
                                                {new Date(selectedCheckIn.created_at as string).toLocaleDateString('en-US', {
                                                    weekday: 'long',
                                                    month: 'long',
                                                    day: 'numeric',
                                                    year: 'numeric',
                                                })}
                                            </Text>
                                            <Text style={styles.modalTime}>
                                                {new Date(selectedCheckIn.created_at as string).toLocaleTimeString('en-US', {
                                                    hour: 'numeric',
                                                    minute: '2-digit',
                                                })}
                                            </Text>
                                        </View>
                                    </View>
                                    <TouchableOpacity
                                        style={styles.modalCloseBtn}
                                        onPress={() => setShowCheckInModal(false)}
                                    >
                                        <Text style={styles.modalCloseBtnText}>✕</Text>
                                    </TouchableOpacity>
                                </View>

                                {/* Modal Body - Check-in Details */}
                                <ScrollView
                                    style={styles.modalBody}
                                    contentContainerStyle={styles.modalBodyContent}
                                    showsVerticalScrollIndicator={true}
                                    bounces={true}
                                >
                                    {renderFullCheckInDetail(
                                        selectedCheckIn.type as string,
                                        selectedCheckIn.data as Record<string, unknown> | undefined
                                    )}
                                </ScrollView>

                                {/* Modal Footer */}
                                <View style={styles.modalFooter}>
                                    <TouchableOpacity
                                        style={styles.modalDoneBtn}
                                        onPress={() => setShowCheckInModal(false)}
                                    >
                                        <Text style={styles.modalDoneBtnText}>Done</Text>
                                    </TouchableOpacity>
                                </View>
                            </>
                        )}
                    </Pressable>
                </Pressable>
            </Modal >

            {/* History Modal */}
            <Modal
                visible={showHistoryModal}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setShowHistoryModal(false)}
            >
                <Pressable
                    style={styles.modalOverlay}
                    onPress={() => setShowHistoryModal(false)}
                >
                    <Pressable
                        style={styles.historyModalContent}
                        onPress={(e) => e.stopPropagation()}
                    >
                        {/* History Modal Header */}
                        <View style={styles.historyModalHeader}>
                            <View>
                                <Text style={styles.historyModalTitle}>📋 Check-in History</Text>
                                <Text style={styles.historyModalSubtitle}>Your recent check-ins</Text>
                            </View>
                            <TouchableOpacity
                                style={styles.modalCloseBtn}
                                onPress={() => setShowHistoryModal(false)}
                            >
                                <Text style={styles.modalCloseBtnText}>✕</Text>
                            </TouchableOpacity>
                        </View>

                        {/* History Modal Body */}
                        <ScrollView
                            style={styles.historyModalBody}
                            contentContainerStyle={styles.historyModalBodyContent}
                            showsVerticalScrollIndicator={true}
                        >
                            {(() => {
                                // Group check-ins by date
                                const today = new Date();
                                const yesterday = new Date(today);
                                yesterday.setDate(yesterday.getDate() - 1);

                                const todayStr = today.toDateString();
                                const yesterdayStr = yesterday.toDateString();

                                const grouped: { [key: string]: typeof checkInHistory } = {};

                                checkInHistory.forEach((checkIn) => {
                                    const date = new Date(checkIn.created_at as string);
                                    const dateStr = date.toDateString();
                                    let label = dateStr;

                                    if (dateStr === todayStr) {
                                        label = 'Today';
                                    } else if (dateStr === yesterdayStr) {
                                        label = 'Yesterday';
                                    } else {
                                        label = date.toLocaleDateString('en-US', {
                                            weekday: 'long',
                                            month: 'short',
                                            day: 'numeric',
                                        });
                                    }

                                    if (!grouped[label]) {
                                        grouped[label] = [];
                                    }
                                    grouped[label].push(checkIn);
                                });

                                const orderedKeys = Object.keys(grouped).sort((a, b) => {
                                    if (a === 'Today') return -1;
                                    if (b === 'Today') return 1;
                                    if (a === 'Yesterday') return -1;
                                    if (b === 'Yesterday') return 1;
                                    return 0;
                                });

                                if (orderedKeys.length === 0) {
                                    return (
                                        <View style={styles.historyEmptyState}>
                                            <Text style={styles.historyEmptyEmoji}>📝</Text>
                                            <Text style={styles.historyEmptyTitle}>No check-ins yet</Text>
                                            <Text style={styles.historyEmptyText}>
                                                Complete your first check-in to see your history here.
                                            </Text>
                                        </View>
                                    );
                                }

                                return orderedKeys.map((dateLabel) => (
                                    <View key={dateLabel} style={styles.historyDateSection}>
                                        <Text style={styles.historyModalDateLabel}>{dateLabel}</Text>
                                        {grouped[dateLabel].map((checkIn, idx) => {
                                            const checkInType = checkIn.type as string;
                                            const emoji = checkInType === 'morning' ? '🌅' :
                                                checkInType === 'midday' ? '☀️' : '🌙';
                                            const label = checkInType === 'morning' ? 'Morning Check-in' :
                                                checkInType === 'midday' ? 'Mid-day Pulse' : 'Evening Reflection';
                                            const time = new Date(checkIn.created_at as string).toLocaleTimeString('en-US', {
                                                hour: 'numeric',
                                                minute: '2-digit',
                                            });

                                            return (
                                                <TouchableOpacity
                                                    key={idx}
                                                    style={[
                                                        styles.historyItem,
                                                        checkInType === 'morning' && styles.historyItemMorning,
                                                        checkInType === 'midday' && styles.historyItemMidday,
                                                        checkInType === 'evening' && styles.historyItemEvening,
                                                    ]}
                                                    onPress={() => {
                                                        setSelectedCheckIn(checkIn);
                                                        setShowHistoryModal(false);
                                                        setShowCheckInModal(true);
                                                    }}
                                                >
                                                    <Text style={styles.historyItemEmoji}>{emoji}</Text>
                                                    <View style={styles.historyItemContent}>
                                                        <Text style={styles.historyItemLabel}>{label}</Text>
                                                        <Text style={styles.historyItemTime}>{time}</Text>
                                                    </View>
                                                    <Text style={styles.historyItemArrow}>→</Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                ));
                            })()}
                        </ScrollView>

                        {/* History Modal Footer */}
                        <View style={styles.modalFooter}>
                            <TouchableOpacity
                                style={styles.modalDoneBtn}
                                onPress={() => setShowHistoryModal(false)}
                            >
                                <Text style={styles.modalDoneBtnText}>Close</Text>
                            </TouchableOpacity>
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>
        </>
    );
}

// Helper function to render full check-in detail for modal
function renderFullCheckInDetail(type: string, data: Record<string, unknown> | undefined): React.ReactElement {
    if (!data) {
        return (
            <View style={styles.noDataContainer}>
                <Text style={styles.noDataText}>No detailed data available</Text>
            </View>
        );
    }

    const renderField = (label: string, value: unknown, emoji: string) => {
        if (value === undefined || value === null) return null;

        let displayValue = String(value);

        // Format specific values
        if (typeof value === 'boolean') {
            displayValue = value ? 'Yes' : 'No';
        } else if (typeof value === 'string') {
            displayValue = value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ');
        }

        return (
            <View key={label} style={styles.detailRow}>
                <Text style={styles.detailEmoji}>{emoji}</Text>
                <View style={styles.detailContent}>
                    <Text style={styles.detailLabel}>{label}</Text>
                    <Text style={styles.detailValue}>{displayValue}</Text>
                </View>
            </View>
        );
    };

    const renderScoreBar = (label: string, score: number, maxScore: number, emoji: string) => {
        const percentage = (score / maxScore) * 100;
        return (
            <View key={label} style={styles.scoreBarContainer}>
                <View style={styles.scoreBarHeader}>
                    <Text style={styles.detailEmoji}>{emoji}</Text>
                    <Text style={styles.detailLabel}>{label}</Text>
                    <Text style={styles.scoreValue}>{score}/{maxScore}</Text>
                </View>
                <View style={styles.scoreBarBackground}>
                    <View style={[styles.scoreBarFill, { width: `${percentage}%` }]} />
                </View>
            </View>
        );
    };

    return (
        <View style={styles.detailContainer}>
            {type === 'morning' && (
                <>
                    <Text style={styles.detailSectionTitle}>Morning Status</Text>
                    {data.rested_score !== undefined &&
                        renderScoreBar('How Rested', Number(data.rested_score), 10, '😴')}
                    {renderField('Motivation Level', data.motivation_level, '💪')}
                    {renderField('Sleep Quality', data.sleep_quality, '🛏️')}
                    {renderField('Woke Up Feeling', data.wake_feeling, '☀️')}
                    {renderField('Morning Mood', data.mood, '😊')}
                    {data.notes && renderField('Notes', data.notes, '📝')}
                </>
            )}

            {type === 'midday' && (
                <>
                    <Text style={styles.detailSectionTitle}>Mid-day Status</Text>
                    {renderField('Energy Level', data.energy_level, '⚡')}
                    {renderField('Current State', data.state, '🧠')}
                    {renderField('Focus Level', data.focus_level, '🎯')}
                    {renderField('Stress Level', data.stress_level, '😰')}
                    {renderField('Productivity', data.productivity, '📊')}
                    {data.notes && renderField('Notes', data.notes, '📝')}
                </>
            )}

            {type === 'evening' && (
                <>
                    <Text style={styles.detailSectionTitle}>Evening Reflection</Text>
                    {renderField('Day vs Expectations', data.day_vs_expectations, '📅')}
                    {renderField('Overall Mood', data.mood, '😊')}
                    {renderField('Energy at End of Day', data.energy_level, '🔋')}

                    <Text style={styles.detailSectionTitle}>Habits Today</Text>
                    {renderField('Late Caffeine (after 3PM)', data.late_caffeine, '☕')}
                    {renderField('Skipped Meals', data.skipped_meals, '🍽️')}
                    {renderField('Alcohol', data.alcohol, '🍷')}
                    {renderField('Exercise', data.exercise, '🏃')}
                    {renderField('Screen Time Before Bed', data.screen_time, '📱')}

                    {data.notes && (
                        <>
                            <Text style={styles.detailSectionTitle}>Notes</Text>
                            {renderField('', data.notes, '📝')}
                        </>
                    )}
                </>
            )}
        </View>
    );
}

// Helper function to render check-in data
function renderCheckInData(type: string, data: Record<string, unknown>): React.ReactElement[] {
    const items: React.ReactElement[] = [];

    if (type === 'morning') {
        if (data.rested_score) {
            items.push(
                <Text key="rested" style={styles.dataItem}>
                    Rested: {String(data.rested_score)}/10
                </Text>
            );
        }
        if (data.motivation_level) {
            const level = String(data.motivation_level);
            items.push(
                <Text key="motivation" style={styles.dataItem}>
                    Motivation: {level.charAt(0).toUpperCase() + level.slice(1)}
                </Text>
            );
        }
    }

    if (type === 'midday') {
        if (data.energy_level) {
            const level = String(data.energy_level);
            items.push(
                <Text key="energy" style={styles.dataItem}>
                    Energy: {level.charAt(0).toUpperCase() + level.slice(1)}
                </Text>
            );
        }
        if (data.state) {
            const stateLabels: Record<string, string> = {
                focused: 'Focused',
                scattered: 'Scattered',
                mentally_drained: 'Mentally Drained',
                physically_tired: 'Physically Tired',
            };
            const stateKey = String(data.state);
            items.push(
                <Text key="state" style={styles.dataItem}>
                    State: {stateLabels[stateKey] || stateKey}
                </Text>
            );
        }
    }

    if (type === 'evening') {
        if (data.day_vs_expectations) {
            const expectation = String(data.day_vs_expectations);
            items.push(
                <Text key="expectations" style={styles.dataItem}>
                    Day: {expectation.charAt(0).toUpperCase() + expectation.slice(1)} than expected
                </Text>
            );
        }
        const habits: string[] = [];
        if (data.late_caffeine) habits.push('Late caffeine');
        if (data.skipped_meals) habits.push('Skipped meals');
        if (data.alcohol) habits.push('Alcohol');
        if (habits.length > 0) {
            items.push(
                <Text key="habits" style={styles.dataItem}>
                    Habits: {habits.join(', ')}
                </Text>
            );
        }
    }

    return items;
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: NatureColors.cream[100],
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
        backgroundColor: NatureColors.cream[100],
    },
    loadingText: {
        marginTop: 16,
        fontSize: 16,
        color: NatureColors.earth[500],
        fontWeight: '500',
    },
    
    // ═══════════════════════════════════════════════════════════
    // HEADER STYLES
    // ═══════════════════════════════════════════════════════════
    header: {
        marginBottom: 24,
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    headerIcon: {
        width: 48,
        height: 48,
        borderRadius: 16,
        backgroundColor: NatureColors.sage[100],
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerIconText: {
        fontSize: 24,
    },
    historyBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: NatureColors.sage[50],
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: NatureColors.sage[200],
    },
    historyBtnIcon: {
        fontSize: 16,
        marginRight: 6,
    },
    historyBtnText: {
        fontSize: 14,
        fontWeight: '600',
        color: NatureColors.sage[600],
    },
    
    // ═══════════════════════════════════════════════════════════
    // TAB TOGGLE
    // ═══════════════════════════════════════════════════════════
    tabToggle: {
        flexDirection: 'row',
        backgroundColor: NatureColors.cream[200],
        borderRadius: 16,
        padding: 4,
        marginBottom: 20,
    },
    tabBtn: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: 'center',
    },
    tabBtnActive: {
        backgroundColor: '#fff',
        shadowColor: NatureColors.earth[900],
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    tabBtnText: {
        fontSize: 15,
        fontWeight: '600',
        color: NatureColors.earth[500],
    },
    tabBtnTextActive: {
        color: NatureColors.sage[700],
        fontWeight: '700',
    },
    
    title: {
        fontSize: 30,
        fontWeight: '800',
        color: NatureColors.earth[800],
        letterSpacing: -0.5,
    },
    subtitle: {
        fontSize: 15,
        color: NatureColors.earth[500],
        marginTop: 4,
        fontWeight: '500',
    },
    
    // ═══════════════════════════════════════════════════════════
    // EMPTY STATE
    // ═══════════════════════════════════════════════════════════
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
        paddingHorizontal: 32,
        backgroundColor: '#fff',
        borderRadius: 28,
        shadowColor: NatureColors.earth[900],
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 24,
        elevation: 3,
    },
    emptyIconWrap: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: NatureColors.sage[50],
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
    },
    emptyEmoji: {
        fontSize: 48,
    },
    emptyTitle: {
        fontSize: 22,
        fontWeight: '700',
        color: NatureColors.earth[800],
        marginBottom: 12,
    },
    emptyText: {
        fontSize: 15,
        color: NatureColors.earth[500],
        textAlign: 'center',
        lineHeight: 24,
        fontWeight: '500',
        marginBottom: 24,
    },
    emptyButton: {
        backgroundColor: NatureColors.sage[500],
        paddingHorizontal: 28,
        paddingVertical: 14,
        borderRadius: 16,
    },
    emptyButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },

    // ═══════════════════════════════════════════════════════════
    // WEEKLY HERO SECTION
    // ═══════════════════════════════════════════════════════════
    weeklyHero: {
        backgroundColor: '#fff',
        borderRadius: 24,
        padding: 24,
        marginBottom: 20,
        shadowColor: NatureColors.earth[900],
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.1,
        shadowRadius: 24,
        elevation: 4,
    },
    weeklyScoreSection: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 24,
    },
    weeklyScoreCircle: {
        width: 90,
        height: 90,
        borderRadius: 45,
        backgroundColor: NatureColors.sage[500],
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 20,
        shadowColor: NatureColors.sage[600],
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 5,
    },
    weeklyScoreValue: {
        fontSize: 32,
        fontWeight: '800',
        color: '#fff',
        lineHeight: 36,
    },
    weeklyScoreLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.8)',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    weeklyScoreInfo: {
        flex: 1,
    },
    weeklyScoreTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: NatureColors.earth[800],
        marginBottom: 6,
    },
    weeklyStatus: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    weeklyStatusEmoji: {
        fontSize: 18,
        marginRight: 6,
    },
    weeklyStatusText: {
        fontSize: 15,
        fontWeight: '600',
        color: NatureColors.earth[500],
    },
    weeklyChange: {
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    weeklyChangeUp: {
        backgroundColor: NatureColors.sage[100],
    },
    weeklyChangeDown: {
        backgroundColor: NatureColors.terracotta[100],
    },
    weeklyChangeText: {
        fontSize: 12,
        fontWeight: '600',
    },
    weeklyChangeTextUp: {
        color: NatureColors.sage[700],
    },
    weeklyChangeTextDown: {
        color: NatureColors.terracotta[700],
    },
    quickStatsGrid: {
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: NatureColors.cream[200],
        paddingTop: 20,
    },
    quickStat: {
        flex: 1,
        alignItems: 'center',
    },
    quickStatIcon: {
        width: 40,
        height: 40,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    quickStatEmoji: {
        fontSize: 18,
    },
    quickStatValue: {
        fontSize: 20,
        fontWeight: '800',
        color: NatureColors.earth[800],
    },
    quickStatLabel: {
        fontSize: 11,
        fontWeight: '600',
        color: NatureColors.earth[500],
        marginTop: 2,
        textTransform: 'uppercase',
        letterSpacing: 0.3,
    },

    // ═══════════════════════════════════════════════════════════
    // CHART CARD
    // ═══════════════════════════════════════════════════════════
    chartCard: {
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 20,
        marginBottom: 20,
        shadowColor: NatureColors.earth[900],
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
        elevation: 2,
    },
    chartHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    chartTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: NatureColors.earth[800],
    },
    chartPeriod: {
        fontSize: 13,
        fontWeight: '600',
        color: NatureColors.earth[500],
        backgroundColor: NatureColors.cream[200],
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 10,
    },
    simpleChart: {
        flexDirection: 'row',
        height: 140,
        alignItems: 'flex-end',
        gap: 8,
    },
    chartColumn: {
        flex: 1,
        alignItems: 'center',
    },
    chartBarWrapper: {
        flex: 1,
        width: '100%',
        justifyContent: 'flex-end',
        alignItems: 'center',
    },
    chartBar: {
        width: '100%',
        borderRadius: 8,
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: 6,
        minHeight: 20,
    },
    chartBarToday: {
        borderWidth: 2,
        borderColor: NatureColors.sage[700],
    },
    chartBarValue: {
        fontSize: 11,
        fontWeight: '700',
        color: '#fff',
    },
    chartDayLabel: {
        fontSize: 11,
        fontWeight: '600',
        color: NatureColors.earth[500],
        marginTop: 8,
    },
    chartDayLabelToday: {
        color: NatureColors.sage[700],
        fontWeight: '700',
    },

    // ═══════════════════════════════════════════════════════════
    // HISTORY SECTION
    // ═══════════════════════════════════════════════════════════
    historySection: {
        marginBottom: 20,
    },
    sectionHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 16,
    },
    sectionHeader: {
        marginBottom: 20,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: NatureColors.earth[800],
    },
    sectionSubtitle: {
        fontSize: 13,
        fontWeight: '500',
        color: NatureColors.earth[500],
        marginTop: 2,
    },
    dataItem: {
        fontSize: 14,
        fontWeight: '500',
        color: NatureColors.earth[500],
        marginBottom: 4,
    },
    viewAllBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: NatureColors.sage[50],
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
    },
    viewAllText: {
        fontSize: 13,
        fontWeight: '600',
        color: NatureColors.sage[700],
    },
    viewAllArrow: {
        fontSize: 13,
        fontWeight: '600',
        color: NatureColors.sage[700],
        marginLeft: 4,
    },
    noHistoryCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 32,
        alignItems: 'center',
    },
    noHistoryEmoji: {
        fontSize: 32,
        marginBottom: 8,
    },
    noHistoryText: {
        fontSize: 14,
        fontWeight: '500',
        color: NatureColors.earth[500],
    },
    historyDateGroup: {
        marginBottom: 16,
    },
    historyDateLabel: {
        fontSize: 13,
        fontWeight: '700',
        color: NatureColors.earth[500],
        marginBottom: 10,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    historyCardsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    historyCard: {
        flex: 1,
        minWidth: 100,
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 14,
        shadowColor: NatureColors.earth[900],
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
        borderLeftWidth: 3,
    },
    historyCardMorning: {
        borderLeftColor: '#F59E0B',
    },
    historyCardMidday: {
        borderLeftColor: '#3B82F6',
    },
    historyCardEvening: {
        borderLeftColor: '#8B5CF6',
    },
    historyCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    historyCardEmoji: {
        fontSize: 20,
    },
    historyCardTime: {
        fontSize: 11,
        fontWeight: '600',
        color: NatureColors.earth[500],
    },
    historyCardLabel: {
        fontSize: 14,
        fontWeight: '700',
        color: NatureColors.earth[800],
        marginBottom: 4,
    },
    historyCardPreview: {
        fontSize: 12,
        fontWeight: '500',
        color: NatureColors.earth[500],
        marginBottom: 8,
    },
    historyCardTap: {
        marginTop: 'auto',
    },
    historyCardTapText: {
        fontSize: 11,
        fontWeight: '600',
        color: NatureColors.sage[600],
    },

    // ═══════════════════════════════════════════════════════════
    // PATTERNS PREVIEW
    // ═══════════════════════════════════════════════════════════
    patternsPreview: {
        backgroundColor: NatureColors.sage[50],
        borderRadius: 20,
        padding: 20,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: NatureColors.sage[200],
    },
    patternsPreviewHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    patternsPreviewTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: NatureColors.sage[700],
    },
    patternsPreviewCount: {
        fontSize: 14,
        fontWeight: '700',
        color: NatureColors.sage[700],
        backgroundColor: NatureColors.sage[100],
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 10,
    },
    patternsPreviewText: {
        fontSize: 14,
        fontWeight: '500',
        color: NatureColors.earth[800],
        lineHeight: 22,
        marginBottom: 10,
    },
    patternsPreviewCta: {
        fontSize: 13,
        fontWeight: '600',
        color: NatureColors.sage[700],
    },

    // Keep original tabs styling for future use
    tabContainer: {
        flexDirection: 'row',
        backgroundColor: NatureColors.cream[200],
        borderRadius: 16,
        padding: 4,
        marginBottom: 20,
    },
    tab: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: 'center',
    },
    tabActive: {
        backgroundColor: '#fff',
        shadowColor: NatureColors.earth[900],
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
        elevation: 3,
    },
    tabText: {
        fontSize: 14,
        fontWeight: '600',
        color: NatureColors.earth[500],
    },
    tabTextActive: {
        color: NatureColors.sage[700],
        fontWeight: '700',
    },

    // Old styles kept for compatibility
    statsCard: {
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 24,
        marginBottom: 16,
        shadowColor: NatureColors.earth[900],
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.08,
        shadowRadius: 20,
        elevation: 3,
    },
    statRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    statItem: {
        flex: 1,
        alignItems: 'center',
    },
    statDivider: {
        width: 1,
        height: 48,
        backgroundColor: NatureColors.cream[200],
    },
    statValue: {
        fontSize: 28,
        fontWeight: '800',
        color: NatureColors.earth[800],
        letterSpacing: -0.5,
    },
    statLabel: {
        fontSize: 12,
        color: NatureColors.earth[500],
        marginTop: 6,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    positiveChange: {
        color: NatureColors.sage[600],
    },
    negativeChange: {
        color: NatureColors.terracotta[600],
    },

    // Hero Energy Score Card
    heroCard: {
        marginBottom: 20,
        borderRadius: 24,
        overflow: 'hidden',
        shadowColor: NatureColors.earth[900],
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 24,
        elevation: 5,
    },
    heroGradient: {
        backgroundColor: NatureColors.sage[500],
        padding: 28,
        position: 'relative',
    },
    heroLabel: {
        fontSize: 13,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.8)',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    heroLabelRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
        width: '100%',
    },
    heroTapHint: {
        fontSize: 10,
        color: 'rgba(255,255,255,0.9)',
        fontWeight: '700',
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        overflow: 'hidden',
        letterSpacing: 0.5,
    },
    heroScoreRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        flexWrap: 'wrap',
    },
    heroScore: {
        fontSize: 56,
        fontWeight: '800',
        color: '#fff',
        letterSpacing: -2,
    },
    heroScoreMax: {
        fontSize: 24,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.7)',
        marginRight: 16,
    },
    heroChange: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        marginTop: 4,
    },
    heroChangePositive: {
        backgroundColor: 'rgba(255,255,255,0.2)',
    },
    heroChangeNegative: {
        backgroundColor: 'rgba(255,100,100,0.3)',
    },
    heroChangeArrow: {
        fontSize: 16,
        color: '#fff',
        marginRight: 4,
    },
    heroChangeText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#fff',
    },
    heroSparkle: {
        position: 'absolute',
        top: 20,
        right: 20,
        fontSize: 28,
    },

    // Main Insight Card
    mainInsightCard: {
        backgroundColor: '#fff',
        borderRadius: 24,
        padding: 24,
        marginBottom: 20,
        shadowColor: NatureColors.earth[900],
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 4,
    },
    insightBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        backgroundColor: NatureColors.sage[50],
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        marginBottom: 16,
    },
    insightBadgeEmoji: {
        fontSize: 14,
        marginRight: 6,
    },
    insightBadgeText: {
        fontSize: 11,
        fontWeight: '800',
        color: NatureColors.sage[700],
        letterSpacing: 0.5,
    },
    insightVisual: {
        alignItems: 'center',
        marginBottom: 20,
        paddingVertical: 16,
    },
    insightVisualEmoji: {
        fontSize: 48,
        marginBottom: 12,
    },
    energyWave: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        height: 50,
        gap: 8,
    },
    waveBar: {
        width: 24,
        borderRadius: 12,
        minHeight: 8,
    },
    mainInsightText: {
        fontSize: 17,
        fontWeight: '500',
        color: NatureColors.earth[800],
        lineHeight: 26,
        textAlign: 'center',
        fontStyle: 'italic',
        marginBottom: 20,
        paddingHorizontal: 8,
    },
    insightActions: {
        flexDirection: 'row',
        gap: 10,
    },
    insightActionBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: NatureColors.cream[200],
        paddingVertical: 12,
        borderRadius: 14,
        gap: 6,
    },
    insightActionBtnPrimary: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: NatureColors.sage[500],
        paddingVertical: 12,
        borderRadius: 14,
        gap: 6,
    },
    insightActionEmoji: {
        fontSize: 14,
    },
    insightActionText: {
        fontSize: 13,
        fontWeight: '600',
        color: NatureColors.earth[500],
    },
    insightActionTextPrimary: {
        fontSize: 13,
        fontWeight: '700',
        color: '#fff',
    },

    // Mini Stats Row
    miniStatsRow: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        shadowColor: NatureColors.earth[900],
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 1,
    },
    miniStat: {
        flex: 1,
        alignItems: 'center',
    },
    miniStatValue: {
        fontSize: 20,
        fontWeight: '800',
        color: NatureColors.earth[800],
    },
    miniStatLabel: {
        fontSize: 11,
        fontWeight: '600',
        color: NatureColors.earth[500],
        marginTop: 4,
        textTransform: 'uppercase',
        letterSpacing: 0.3,
    },
    miniStatDivider: {
        width: 1,
        height: 32,
        backgroundColor: NatureColors.cream[300],
        alignSelf: 'center',
    },

    // Compact Chart
    chartCardCompact: {
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 20,
        marginBottom: 16,
        shadowColor: NatureColors.earth[900],
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
        elevation: 2,
    },
    chartHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    chartTitleCompact: {
        fontSize: 16,
        fontWeight: '700',
        color: NatureColors.earth[800],
    },
    chartSubtitle: {
        fontSize: 12,
        fontWeight: '500',
        color: NatureColors.earth[500],
    },
    chartCompact: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        height: 100,
    },
    chartBarCompact: {
        alignItems: 'center',
        flex: 1,
    },
    barContainerCompact: {
        width: 20,
        height: 70,
        backgroundColor: NatureColors.cream[200],
        borderRadius: 10,
        justifyContent: 'flex-end',
        overflow: 'hidden',
    },
    barCompact: {
        width: '100%',
        borderRadius: 10,
    },
    barLabelCompact: {
        fontSize: 10,
        color: NatureColors.earth[500],
        marginTop: 8,
        fontWeight: '600',
    },

    // Line Graph Styles
    lineGraphContainer: {
        flexDirection: 'row',
        height: 140,
        marginBottom: 8,
    },
    yAxisLabels: {
        width: 24,
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        paddingRight: 8,
        paddingVertical: 4,
    },
    yAxisLabel: {
        fontSize: 10,
        color: NatureColors.earth[500],
        fontWeight: '500',
    },
    graphArea: {
        flex: 1,
        position: 'relative',
    },
    gridLines: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'space-between',
    },
    gridLine: {
        height: 1,
        backgroundColor: NatureColors.cream[200],
    },
    lineGraphContent: {
        flex: 1,
        flexDirection: 'row',
        position: 'relative',
    },
    dataPointColumn: {
        flex: 1,
        position: 'relative',
        height: '100%',
    },
    dataPointWrapper: {
        position: 'absolute',
        left: '50%',
        transform: [{ translateX: -16 }],
        alignItems: 'center',
        zIndex: 10,
    },
    dataPoint: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
        elevation: 3,
        borderWidth: 3,
        borderColor: '#fff',
    },
    dataPointValue: {
        fontSize: 11,
        fontWeight: '800',
        color: '#fff',
    },
    dataPointEmpty: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: NatureColors.cream[300],
        borderWidth: 2,
        borderColor: '#fff',
    },
    connectionLine: {
        position: 'absolute',
        height: 3,
        left: 16,
        top: 14,
        transformOrigin: 'left center',
        borderRadius: 2,
    },
    xAxisLabels: {
        flexDirection: 'row',
        marginLeft: 24,
    },
    xAxisLabel: {
        flex: 1,
        textAlign: 'center',
        fontSize: 11,
        fontWeight: '600',
        color: NatureColors.earth[500],
    },

    emptyPatterns: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
        paddingHorizontal: 40,
        backgroundColor: '#fff',
        borderRadius: 24,
        shadowColor: NatureColors.earth[900],
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 16,
        elevation: 2,
    },
    // ============ Aha Moment Card Styles ============
    drainCard: {
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 20,
        marginBottom: 16,
        borderWidth: 2,
        borderColor: NatureColors.terracotta[200],
        shadowColor: NatureColors.terracotta[500],
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
        elevation: 3,
    },
    boosterCard: {
        backgroundColor: NatureColors.sage[50],
        borderRadius: 20,
        padding: 20,
        marginBottom: 16,
        borderWidth: 2,
        borderColor: NatureColors.sage[300],
        shadowColor: NatureColors.sage[500],
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
        elevation: 3,
    },
    todayCard: {
        backgroundColor: '#FFF7ED',
        borderRadius: 20,
        padding: 20,
        marginBottom: 16,
        borderWidth: 2,
        borderColor: '#FB923C',
        shadowColor: '#F97316',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 4,
    },
    todayCardLabel: {
        fontSize: 14,
        fontWeight: '800',
        color: '#EA580C',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    todayCardTitle: {
        fontSize: 22,
        fontWeight: '800',
        color: '#C2410C',
        marginBottom: 14,
        lineHeight: 28,
    },
    todayCardText: {
        fontSize: 15,
        color: '#9A3412',
        flex: 1,
        lineHeight: 20,
    },
    todayActionBox: {
        backgroundColor: '#FFEDD5',
        borderRadius: 12,
        padding: 14,
        marginTop: 12,
        borderLeftWidth: 4,
        borderLeftColor: '#F97316',
    },
    todayActionLabel: {
        fontSize: 12,
        fontWeight: '700',
        color: '#EA580C',
        marginBottom: 6,
    },
    todayActionText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#C2410C',
        marginBottom: 6,
        lineHeight: 22,
    },
    todayBenefit: {
        fontSize: 13,
        color: '#9A3412',
        fontStyle: 'italic',
    },
    experimentCard: {
        backgroundColor: NatureColors.sage[50],
        borderRadius: 20,
        padding: 20,
        marginBottom: 16,
        borderWidth: 2,
        borderColor: NatureColors.sage[200],
        shadowColor: NatureColors.sage[500],
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
        elevation: 3,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    cardEmoji: {
        fontSize: 28,
        marginRight: 10,
    },
    cardLabel: {
        fontSize: 13,
        fontWeight: '700',
        color: NatureColors.terracotta[700],
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    cardLabelBooster: {
        fontSize: 13,
        fontWeight: '700',
        color: NatureColors.sage[700],
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    cardMainTitle: {
        fontSize: 24,
        fontWeight: '800',
        color: NatureColors.earth[800],
        marginBottom: 16,
        letterSpacing: -0.3,
    },
    cardMainTitleBooster: {
        fontSize: 24,
        fontWeight: '800',
        color: NatureColors.sage[800],
        marginBottom: 16,
        letterSpacing: -0.3,
    },
    insightRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 10,
    },
    insightIcon: {
        fontSize: 16,
        marginRight: 10,
        marginTop: 2,
    },
    insightText: {
        flex: 1,
        fontSize: 15,
        color: NatureColors.earth[500],
        lineHeight: 22,
        fontWeight: '500',
    },
    insightTextBooster: {
        flex: 1,
        fontSize: 15,
        color: NatureColors.sage[700],
        lineHeight: 22,
        fontWeight: '500',
    },
    actionBox: {
        backgroundColor: NatureColors.terracotta[50],
        borderRadius: 14,
        padding: 16,
        marginTop: 12,
        borderWidth: 1,
        borderColor: NatureColors.terracotta[200],
    },
    actionBoxBooster: {
        backgroundColor: NatureColors.sage[100],
        borderRadius: 14,
        padding: 16,
        marginTop: 12,
        borderWidth: 1,
        borderColor: NatureColors.sage[300],
    },
    actionLabel: {
        fontSize: 12,
        fontWeight: '700',
        color: NatureColors.terracotta[700],
        marginBottom: 6,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    actionLabelBooster: {
        fontSize: 12,
        fontWeight: '700',
        color: NatureColors.sage[700],
        marginBottom: 6,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    actionText: {
        fontSize: 15,
        fontWeight: '600',
        color: NatureColors.terracotta[800],
        lineHeight: 22,
    },
    actionTextBooster: {
        fontSize: 15,
        fontWeight: '600',
        color: NatureColors.sage[800],
        lineHeight: 22,
    },
    experimentLabel: {
        fontSize: 13,
        fontWeight: '700',
        color: NatureColors.sage[700],
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    experimentTitle: {
        fontSize: 22,
        fontWeight: '800',
        color: NatureColors.sage[800],
        marginBottom: 16,
        letterSpacing: -0.3,
    },
    commitmentBox: {
        backgroundColor: '#fff',
        borderRadius: 14,
        padding: 16,
        marginTop: 16,
        gap: 8,
    },
    commitmentText: {
        fontSize: 14,
        fontWeight: '600',
        color: NatureColors.sage[700],
    },
    checkInText: {
        fontSize: 13,
        fontWeight: '500',
        color: NatureColors.earth[500],
    },

    // Discovery Moments - Folded Card Styles
    discoveryCardFolded: {
        backgroundColor: '#fff',
        borderRadius: 20,
        marginBottom: 16,
        overflow: 'hidden',
        shadowColor: NatureColors.earth[900],
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 24,
        elevation: 4,
        borderWidth: 2,
        borderColor: NatureColors.cream[300],
    },
    discoveryCardFoldedDrain: {
        borderColor: NatureColors.terracotta[300],
        backgroundColor: NatureColors.terracotta[50],
    },
    discoveryCardFoldedBooster: {
        borderColor: NatureColors.sage[300],
        backgroundColor: NatureColors.sage[50],
    },
    discoveryCardFoldedInsight: {
        borderColor: NatureColors.sage[300],
        backgroundColor: NatureColors.sage[50],
    },
    foldedContent: {
        padding: 20,
        alignItems: 'center',
    },
    tapPrompt: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.05)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        marginBottom: 16,
    },
    tapIcon: {
        fontSize: 14,
        marginRight: 6,
    },
    tapText: {
        fontSize: 12,
        fontWeight: '600',
        color: NatureColors.earth[500],
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    foldedMain: {
        alignItems: 'center',
    },
    foldedEmoji: {
        fontSize: 48,
        marginBottom: 12,
    },
    foldedTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: NatureColors.earth[800],
        textAlign: 'center',
    },
    foldedTitleDrain: {
        color: NatureColors.terracotta[700],
    },
    foldedTitleBooster: {
        color: NatureColors.sage[700],
    },
    newBadge: {
        position: 'absolute',
        top: 0,
        right: 0,
        backgroundColor: NatureColors.terracotta[500],
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    newBadgeText: {
        fontSize: 10,
        fontWeight: '800',
        color: '#fff',
        letterSpacing: 0.5,
    },
    foldedHint: {
        backgroundColor: 'rgba(0,0,0,0.03)',
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderTopWidth: 1,
        borderTopColor: 'rgba(0,0,0,0.05)',
    },
    foldedHintText: {
        fontSize: 14,
        color: Colors.text.secondary,
        textAlign: 'center',
        fontStyle: 'italic',
    },

    // Discovery Moments - Revealed Card Styles
    discoveryCardRevealed: {
        backgroundColor: '#fff',
        borderRadius: 20,
        marginBottom: 16,
        padding: 24,
        shadowColor: Colors.neutral[900],
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 24,
        elevation: 5,
        borderWidth: 2,
        borderColor: Colors.neutral[200],
    },
    discoveryCardRevealedDrain: {
        borderColor: Colors.warning[400],
        backgroundColor: '#fff',
    },
    discoveryCardRevealedBooster: {
        borderColor: Colors.success[400],
        backgroundColor: '#fff',
    },
    discoveryCardRevealedInsight: {
        borderColor: Colors.primary[400],
        backgroundColor: '#fff',
    },
    revealedHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    revealedEmoji: {
        fontSize: 36,
        marginRight: 12,
    },
    revealedTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: Colors.text.primary,
        flex: 1,
    },
    revealedTitleDrain: {
        color: Colors.warning[700],
    },
    revealedTitleBooster: {
        color: Colors.success[700],
    },
    patternQuote: {
        backgroundColor: Colors.neutral[100],
        borderRadius: 14,
        padding: 16,
        marginBottom: 16,
        borderLeftWidth: 4,
        borderLeftColor: Colors.primary[400],
    },
    patternQuoteText: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.text.primary,
        lineHeight: 24,
        fontStyle: 'italic',
    },
    revealedRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 10,
    },
    revealedIcon: {
        fontSize: 16,
        marginRight: 10,
        marginTop: 2,
    },
    revealedText: {
        flex: 1,
        fontSize: 15,
        color: Colors.text.secondary,
        lineHeight: 22,
        fontWeight: '500',
    },
    revealedActions: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 16,
    },
    actionButtonPrimary: {
        flex: 1,
        backgroundColor: Colors.primary[500],
        borderRadius: 14,
        paddingVertical: 14,
        alignItems: 'center',
        shadowColor: Colors.primary[900],
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 3,
    },
    actionButtonPrimaryText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#fff',
    },
    actionButtonSecondary: {
        flex: 1,
        backgroundColor: Colors.neutral[100],
        borderRadius: 14,
        paddingVertical: 14,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: Colors.neutral[200],
    },
    actionButtonSecondaryText: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.text.secondary,
    },

    // History tap hint
    historyTapHint: {
        fontSize: 12,
        color: Colors.primary[500],
        marginTop: 6,
        fontWeight: '500',
    },

    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        maxHeight: '85%',
        paddingTop: 8,
        flex: 0,
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        paddingVertical: 20,
        borderBottomWidth: 1,
        borderBottomColor: Colors.neutral[100],
    },
    modalHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        flex: 1,
    },
    modalEmoji: {
        fontSize: 40,
        marginRight: 16,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: Colors.text.primary,
        marginBottom: 4,
    },
    modalDate: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.text.secondary,
    },
    modalTime: {
        fontSize: 13,
        fontWeight: '500',
        color: Colors.text.secondary,
        marginTop: 2,
    },
    modalCloseBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: Colors.neutral[100],
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalCloseBtnText: {
        fontSize: 18,
        color: Colors.text.secondary,
        fontWeight: '600',
    },
    modalBody: {
        paddingHorizontal: 24,
        flexGrow: 1,
        flexShrink: 1,
    },
    modalBodyContent: {
        paddingVertical: 20,
        paddingBottom: 10,
    },
    modalFooter: {
        paddingHorizontal: 24,
        paddingVertical: 16,
        borderTopWidth: 1,
        borderTopColor: Colors.neutral[100],
        paddingBottom: 34,
    },
    modalDoneBtn: {
        backgroundColor: Colors.primary[500],
        borderRadius: 16,
        paddingVertical: 16,
        alignItems: 'center',
        shadowColor: Colors.primary[900],
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 3,
    },
    modalDoneBtnText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#fff',
    },

    // History Modal Styles
    historyModalContent: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        maxHeight: '90%',
        paddingTop: 8,
        flex: 0,
    },
    historyModalHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        paddingVertical: 20,
        borderBottomWidth: 1,
        borderBottomColor: Colors.neutral[100],
    },
    historyModalTitle: {
        fontSize: 22,
        fontWeight: '800',
        color: Colors.text.primary,
        marginBottom: 4,
    },
    historyModalSubtitle: {
        fontSize: 14,
        fontWeight: '500',
        color: Colors.text.secondary,
    },
    historyModalBody: {
        paddingHorizontal: 24,
        flexGrow: 1,
        flexShrink: 1,
    },
    historyModalBodyContent: {
        paddingVertical: 16,
        paddingBottom: 10,
    },
    historyDateSection: {
        marginBottom: 20,
    },
    historyModalDateLabel: {
        fontSize: 16,
        fontWeight: '700',
        color: Colors.text.primary,
        marginBottom: 12,
    },
    historyItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.neutral[50],
        borderRadius: 14,
        padding: 14,
        marginBottom: 10,
        borderLeftWidth: 4,
    },
    historyItemMorning: {
        borderLeftColor: '#F59E0B',
    },
    historyItemMidday: {
        borderLeftColor: '#3B82F6',
    },
    historyItemEvening: {
        borderLeftColor: '#8B5CF6',
    },
    historyItemEmoji: {
        fontSize: 24,
        marginRight: 14,
    },
    historyItemContent: {
        flex: 1,
    },
    historyItemLabel: {
        fontSize: 15,
        fontWeight: '600',
        color: Colors.text.primary,
        marginBottom: 2,
    },
    historyItemTime: {
        fontSize: 13,
        fontWeight: '500',
        color: Colors.text.secondary,
    },
    historyItemArrow: {
        fontSize: 18,
        color: Colors.primary[400],
        fontWeight: '600',
    },
    historyEmptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
    },
    historyEmptyEmoji: {
        fontSize: 48,
        marginBottom: 16,
    },
    historyEmptyTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: Colors.text.primary,
        marginBottom: 8,
    },
    historyEmptyText: {
        fontSize: 14,
        fontWeight: '500',
        color: Colors.text.secondary,
        textAlign: 'center',
        paddingHorizontal: 20,
    },

    // Detail view styles
    noDataContainer: {
        padding: 40,
        alignItems: 'center',
    },
    noDataText: {
        fontSize: 15,
        color: Colors.text.secondary,
        fontStyle: 'italic',
    },
    detailContainer: {
        gap: 12,
    },
    detailSectionTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: Colors.text.secondary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginTop: 16,
        marginBottom: 8,
    },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.neutral[50],
        borderRadius: 14,
        padding: 14,
    },
    detailEmoji: {
        fontSize: 24,
        marginRight: 14,
    },
    detailContent: {
        flex: 1,
    },
    detailLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: Colors.text.secondary,
        marginBottom: 2,
    },
    detailValue: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.text.primary,
    },
    scoreBarContainer: {
        backgroundColor: Colors.neutral[50],
        borderRadius: 14,
        padding: 14,
        marginBottom: 4,
    },
    scoreBarHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
    },
    scoreValue: {
        fontSize: 16,
        fontWeight: '700',
        color: Colors.primary[600],
        marginLeft: 'auto',
    },
    scoreBarBackground: {
        height: 8,
        backgroundColor: Colors.neutral[200],
        borderRadius: 4,
        overflow: 'hidden',
    },
    scoreBarFill: {
        height: '100%',
        backgroundColor: Colors.primary[500],
        borderRadius: 4,
    },
});

// Calendar Insight Styles - Professional UI/UX Design
const calendarInsightStyles = StyleSheet.create({
    meetingCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 20,
        marginBottom: 16,
        shadowColor: Colors.neutral[900],
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 24,
        elevation: 4,
        borderWidth: 1,
        borderColor: NatureColors.cream[200],
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 24,
    },
    cardIconContainer: {
        width: 44,
        height: 44,
        borderRadius: 14,
        backgroundColor: NatureColors.cream[100],
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    cardIcon: {
        fontSize: 22,
    },
    cardHeaderText: {
        flex: 1,
    },
    cardTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: Colors.text.primary,
        letterSpacing: -0.3,
    },
    cardSubtitle: {
        fontSize: 13,
        color: Colors.text.secondary,
        marginTop: 2,
    },
    // Chart wrapper with Y-axis
    chartWrapper: {
        flexDirection: 'row',
        marginBottom: 20,
    },
    yAxis: {
        width: 28,
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        paddingRight: 8,
        height: 120,
    },
    yAxisLabel: {
        fontSize: 10,
        fontWeight: '600',
        color: Colors.text.secondary,
    },
    chartArea: {
        flex: 1,
        height: 120,
        position: 'relative',
    },
    gridLines: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'space-between',
    },
    gridLine: {
        height: 1,
        backgroundColor: NatureColors.cream[200],
    },
    barsContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-around',
        height: '100%',
        paddingHorizontal: 4,
    },
    barColumn: {
        flex: 1,
        alignItems: 'center',
        maxWidth: 50,
    },
    barContainer: {
        width: '100%',
        height: 120,
        justifyContent: 'flex-end',
        alignItems: 'center',
    },
    bar: {
        width: 28,
        borderRadius: 6,
        minHeight: 4,
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingTop: 4,
    },
    barValueLabel: {
        fontSize: 9,
        fontWeight: '700',
        color: '#FFFFFF',
        textShadowColor: 'rgba(0,0,0,0.3)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
    },
    barDayLabel: {
        fontSize: 11,
        fontWeight: '600',
        color: Colors.text.secondary,
        marginTop: 8,
    },
    barDayLabelToday: {
        fontWeight: '800',
        color: Colors.primary[600],
    },
    barBadge: {
        marginTop: 4,
        width: 20,
        height: 20,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    barBadgeWorst: {
        backgroundColor: NatureColors.terracotta[100],
    },
    barBadgeBest: {
        backgroundColor: NatureColors.sage[100],
    },
    barBadgeText: {
        fontSize: 10,
    },
    // Stats grid
    weeklyStats: {
        backgroundColor: NatureColors.cream[50],
        borderRadius: 16,
        padding: 16,
    },
    statsGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    statBox: {
        flex: 1,
        alignItems: 'center',
    },
    statBoxValue: {
        fontSize: 18,
        fontWeight: '800',
        color: Colors.text.primary,
        marginBottom: 4,
    },
    statBoxLabel: {
        fontSize: 10,
        fontWeight: '600',
        color: Colors.text.secondary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    statRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    statIcon: {
        fontSize: 14,
        marginRight: 10,
    },
    statText: {
        fontSize: 14,
        color: Colors.text.secondary,
        flex: 1,
    },
    statBold: {
        fontWeight: '700',
        color: Colors.text.primary,
    },
    // Correlation card
    correlationCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 20,
        marginBottom: 16,
        borderLeftWidth: 4,
        borderLeftColor: Colors.primary[400],
        shadowColor: Colors.neutral[900],
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 24,
        elevation: 4,
    },
    correlationContent: {},
    correlationEmpty: {
        paddingVertical: 24,
        alignItems: 'center',
    },
    correlationEmptyText: {
        fontSize: 14,
        color: Colors.text.secondary,
        textAlign: 'center',
        marginTop: 8,
    },
    patternBox: {
        marginBottom: 16,
    },
    patternLabel: {
        fontSize: 12,
        fontWeight: '700',
        color: Colors.text.secondary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 8,
    },
    patternText: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.text.primary,
        lineHeight: 24,
        fontStyle: 'italic',
    },
    tipBox: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: Colors.primary[50],
        borderRadius: 16,
        padding: 16,
    },
    tipEmoji: {
        fontSize: 18,
        marginRight: 12,
    },
    tipText: {
        flex: 1,
        fontSize: 14,
        color: Colors.primary[700],
        lineHeight: 21,
        fontWeight: '500',
    },
});

// Additional Correlation Card Styles
const correlationStyles = StyleSheet.create({
    emptyStateIcon: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: NatureColors.cream[100],
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
    },
    emptyStateTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: Colors.text.primary,
        marginBottom: 4,
    },
    infoBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: NatureColors.cream[100],
        borderRadius: 12,
        padding: 14,
        marginBottom: 16,
    },
    infoIcon: {
        fontSize: 20,
        marginRight: 12,
    },
    infoText: {
        flex: 1,
        fontSize: 14,
        color: Colors.text.secondary,
    },
    comparisonContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
        paddingHorizontal: 8,
    },
    comparisonItem: {
        alignItems: 'center',
        flex: 1,
    },
    energyCircle: {
        width: 64,
        height: 64,
        borderRadius: 32,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    energyValue: {
        fontSize: 24,
        fontWeight: '800',
    },
    comparisonLabel: {
        fontSize: 13,
        fontWeight: '700',
        color: Colors.text.primary,
    },
    comparisonSubLabel: {
        fontSize: 11,
        color: Colors.text.secondary,
        marginTop: 2,
    },
    arrowContainer: {
        alignItems: 'center',
        paddingHorizontal: 12,
    },
    arrowText: {
        fontSize: 24,
        fontWeight: '300',
        color: Colors.text.secondary,
    },
    diffText: {
        fontSize: 16,
        fontWeight: '800',
        marginTop: 4,
    },
    patternBox: {
        backgroundColor: NatureColors.cream[50],
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
    },
    patternHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
    },
    patternIcon: {
        fontSize: 18,
        marginRight: 8,
    },
    patternTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: Colors.text.primary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    patternDescription: {
        fontSize: 15,
        fontWeight: '500',
        color: Colors.text.primary,
        lineHeight: 22,
    },
    tipContent: {
        flex: 1,
    },
    tipTitle: {
        fontSize: 12,
        fontWeight: '700',
        color: Colors.primary[600],
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 4,
    },
});
