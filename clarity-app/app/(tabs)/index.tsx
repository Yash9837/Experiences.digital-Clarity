import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
  Animated,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { EnergyScore } from '@/types';
import {
  getTodayEnergyScore,
  getCheckInStatus,
  submitFeedback,
  getYesterdayScore,
  getUserBaseline,
  getQuickActions,
} from '@/lib/energyService';
import {
  isCalendarEnabled,
  fetchTodayCalendarData,
  syncCalendarData,
  CognitiveLoadMetrics,
  getCognitiveLoadScore,
  getCognitiveLoadLabel,
  getSmartTip,
  getTimeBlocks,
  TimeBlock,
} from '@/lib/calendarService';

const { width: screenWidth } = Dimensions.get('window');

// ═══════════════════════════════════════════════════════════════════
// NATURE-INSPIRED COLOR PALETTE
// Sage Green (growth/calm) + Terracotta (energy) + Cream/Beige backgrounds
// ═══════════════════════════════════════════════════════════════════
const NatureColors = {
  // Sage Green - Primary (calm, growth, health)
  sage: {
    50: '#F6F9F4',
    100: '#E8F0E3',
    200: '#D4E4CA',
    300: '#B5D1A4',
    400: '#8FB87A',
    500: '#6B9B59', // Main sage
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
    500: '#E2714D', // Main terracotta
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
    1: '#C85A3A',  // Deep terracotta (low energy)
    2: '#E2714D',
    3: '#ED8B6B',
    4: '#F5B49D',
    5: '#E3CBAA', // Neutral cream
    6: '#B5D1A4',
    7: '#8FB87A',
    8: '#6B9B59',
    9: '#537A45',
    10: '#425F38', // Deep sage (high energy)
  },
};

// Energy color based on score
const getEnergyColor = (score: number): string => {
  const index = Math.min(Math.max(Math.round(score), 1), 10) as keyof typeof NatureColors.energyGradient;
  return NatureColors.energyGradient[index];
};

// Get energy label with nature metaphor
const getEnergyLabel = (score: number): { emoji: string; text: string } => {
  if (score >= 8) return { emoji: '🌳', text: 'Flourishing' };
  if (score >= 6) return { emoji: '🌿', text: 'Growing Strong' };
  if (score >= 4) return { emoji: '🌱', text: 'Steady Ground' };
  return { emoji: '🍂', text: 'Rest & Restore' };
};

interface CheckInStatus {
  morning: boolean;
  midday: boolean;
  evening: boolean;
}

// ═══════════════════════════════════════════════════════════════════
// TODAY'S MENTAL LOAD CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════
interface TodaysMentalLoadCardProps {
  metrics: CognitiveLoadMetrics | null;
  loading: boolean;
}

function TodaysMentalLoadCard({ metrics, loading }: TodaysMentalLoadCardProps) {
  if (loading) {
    return (
      <View style={calendarStyles.card}>
        <View style={calendarStyles.cardHeader}>
          <View style={calendarStyles.cardIconContainer}>
            <Text style={calendarStyles.cardIcon}>📅</Text>
          </View>
          <Text style={calendarStyles.cardTitle}>Today's Mental Load</Text>
        </View>
        <View style={calendarStyles.loadingContainer}>
          <ActivityIndicator size="small" color={NatureColors.sage[500]} />
          <Text style={calendarStyles.loadingText}>Analyzing your schedule...</Text>
        </View>
      </View>
    );
  }

  if (!metrics) {
    return null; // Calendar not enabled or no permission
  }

  const loadScore = getCognitiveLoadScore(metrics);
  const loadInfo = getCognitiveLoadLabel(loadScore);
  const smartTip = getSmartTip(metrics);
  
  // Calculate progress bar width (max 8 hours = 100%)
  const progressWidth = Math.min((metrics.meetingHours / 8) * 100, 100);
  
  // Generate hour markers for visual timeline
  const hourMarkers = [9, 11, 13, 15, 17];

  return (
    <View style={calendarStyles.card}>
      {/* Header */}
      <View style={calendarStyles.cardHeader}>
        <View style={calendarStyles.cardIconContainer}>
          <Text style={calendarStyles.cardIcon}>📅</Text>
        </View>
        <View style={calendarStyles.cardHeaderText}>
          <Text style={calendarStyles.cardTitle}>Today's Mental Load</Text>
          <Text style={calendarStyles.cardSubtitle}>
            {metrics.meetingCount} meeting{metrics.meetingCount !== 1 ? 's' : ''} scheduled
          </Text>
        </View>
      </View>

      {/* Load Level + Hours - Unified Display */}
      <View style={calendarStyles.loadDisplay}>
        <View style={[calendarStyles.loadBadge, { backgroundColor: loadInfo.color + '15' }]}>
          <Text style={calendarStyles.loadEmoji}>{loadInfo.emoji}</Text>
          <Text style={[calendarStyles.loadLabel, { color: loadInfo.color }]}>
            {loadInfo.label.toUpperCase()}
          </Text>
        </View>
        <View style={calendarStyles.hoursDisplay}>
          <Text style={calendarStyles.hoursValue}>{metrics.meetingHours.toFixed(1)}</Text>
          <Text style={calendarStyles.hoursUnit}>hours</Text>
        </View>
      </View>

      {/* Visual Progress Bar with Gradient Effect */}
      <View style={calendarStyles.progressSection}>
        <View style={calendarStyles.progressBar}>
          <View style={calendarStyles.progressTrack}>
            <Animated.View 
              style={[
                calendarStyles.progressFill, 
                { 
                  width: `${progressWidth}%`, 
                  backgroundColor: loadInfo.color,
                }
              ]} 
            />
          </View>
          {/* Scale markers */}
          <View style={calendarStyles.progressScale}>
            {[0, 2, 4, 6, 8].map((hour) => (
              <Text key={hour} style={calendarStyles.progressScaleLabel}>{hour}h</Text>
            ))}
          </View>
        </View>
      </View>

      {/* Visual Timeline - Horizontal Day View */}
      <View style={calendarStyles.timelineSection}>
        <Text style={calendarStyles.sectionLabel}>📍 Day Overview</Text>
        <View style={calendarStyles.visualTimeline}>
          {/* Time axis background */}
          <View style={calendarStyles.timelineTrack}>
            {/* Meeting blocks visualization */}
            {metrics.meetingCount > 0 ? (
              <>
                {/* First meeting indicator */}
                {metrics.firstMeetingTime && (
                  <View style={[calendarStyles.meetingBlock, { left: '5%', width: '25%' }]}>
                    <View style={[calendarStyles.meetingBlockFill, { backgroundColor: loadInfo.color }]} />
                  </View>
                )}
                {/* Show gap if exists */}
                {metrics.longestGap >= 30 && (
                  <View style={[calendarStyles.gapBlock, { left: '32%', width: '15%' }]}>
                    <View style={calendarStyles.gapBlockFill} />
                  </View>
                )}
                {/* Additional meetings if more than 1 */}
                {metrics.meetingCount > 1 && (
                  <View style={[calendarStyles.meetingBlock, { left: '50%', width: `${Math.min(metrics.meetingCount * 8, 40)}%` }]}>
                    <View style={[calendarStyles.meetingBlockFill, { backgroundColor: loadInfo.color, opacity: 0.7 }]} />
                  </View>
                )}
              </>
            ) : (
              <View style={calendarStyles.freeDay}>
                <Text style={calendarStyles.freeDayText}>✨ Meeting-free day</Text>
              </View>
            )}
          </View>
          {/* Hour labels */}
          <View style={calendarStyles.timelineHours}>
            {hourMarkers.map((hour) => (
              <Text key={hour} style={calendarStyles.timelineHourLabel}>
                {hour > 12 ? `${hour - 12}pm` : hour === 12 ? '12pm' : `${hour}am`}
              </Text>
            ))}
          </View>
        </View>
      </View>

      {/* Key Stats Row */}
      <View style={calendarStyles.statsRow}>
        <View style={calendarStyles.statItem}>
          <Text style={calendarStyles.statValue}>
            {metrics.firstMeetingTime || '—'}
          </Text>
          <Text style={calendarStyles.statLabel}>First</Text>
        </View>
        <View style={calendarStyles.statDivider} />
        <View style={calendarStyles.statItem}>
          <Text style={calendarStyles.statValue}>
            {metrics.lastMeetingTime || '—'}
          </Text>
          <Text style={calendarStyles.statLabel}>Last</Text>
        </View>
        <View style={calendarStyles.statDivider} />
        <View style={calendarStyles.statItem}>
          <Text style={[
            calendarStyles.statValue,
            metrics.backToBack >= 2 && { color: NatureColors.terracotta[500] }
          ]}>
            {metrics.backToBack}
          </Text>
          <Text style={calendarStyles.statLabel}>Back-to-back</Text>
        </View>
        <View style={calendarStyles.statDivider} />
        <View style={calendarStyles.statItem}>
          <Text style={calendarStyles.statValue}>
            {metrics.longestGap >= 60 
              ? `${(metrics.longestGap / 60).toFixed(1)}h` 
              : `${metrics.longestGap}m`}
          </Text>
          <Text style={calendarStyles.statLabel}>Longest gap</Text>
        </View>
      </View>

      {/* Smart Tip */}
      <View style={[
        calendarStyles.tipContainer,
        smartTip.priority === 'high' && calendarStyles.tipContainerHigh,
        smartTip.priority === 'medium' && calendarStyles.tipContainerMedium,
      ]}>
        <View style={calendarStyles.tipIconContainer}>
          <Text style={calendarStyles.tipEmoji}>{smartTip.emoji}</Text>
        </View>
        <View style={calendarStyles.tipContent}>
          <Text style={calendarStyles.tipLabel}>
            {smartTip.priority === 'high' ? 'Important' : smartTip.priority === 'medium' ? 'Tip' : 'Note'}
          </Text>
          <Text style={calendarStyles.tipText}>{smartTip.tip}</Text>
        </View>
      </View>
    </View>
  );
}

// Calendar Card Styles - Professional UI/UX Design
const calendarStyles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
    shadowColor: NatureColors.earth[900],
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
    marginBottom: 20,
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
    color: NatureColors.earth[800],
    letterSpacing: -0.3,
  },
  cardSubtitle: {
    fontSize: 13,
    color: NatureColors.earth[500],
    marginTop: 2,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  loadingText: {
    fontSize: 14,
    color: NatureColors.earth[500],
    marginLeft: 12,
  },
  loadDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  loadBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
  },
  loadEmoji: {
    fontSize: 18,
    marginRight: 8,
  },
  loadLabel: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
  },
  hoursDisplay: {
    alignItems: 'flex-end',
  },
  hoursValue: {
    fontSize: 32,
    fontWeight: '800',
    color: NatureColors.earth[800],
    letterSpacing: -1,
  },
  hoursUnit: {
    fontSize: 13,
    fontWeight: '600',
    color: NatureColors.earth[500],
    marginTop: -4,
  },
  progressSection: {
    marginBottom: 20,
  },
  progressBar: {
    position: 'relative',
  },
  progressTrack: {
    height: 12,
    backgroundColor: NatureColors.cream[200],
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 6,
  },
  progressScale: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingHorizontal: 2,
  },
  progressScaleLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: NatureColors.earth[400],
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: NatureColors.earth[600],
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  timelineSection: {
    marginBottom: 20,
  },
  visualTimeline: {
    backgroundColor: NatureColors.cream[50],
    borderRadius: 16,
    padding: 16,
    paddingBottom: 8,
  },
  timelineTrack: {
    height: 32,
    backgroundColor: NatureColors.cream[200],
    borderRadius: 8,
    position: 'relative',
    overflow: 'hidden',
  },
  meetingBlock: {
    position: 'absolute',
    top: 4,
    height: 24,
    borderRadius: 4,
  },
  meetingBlockFill: {
    width: '100%',
    height: '100%',
    borderRadius: 4,
  },
  gapBlock: {
    position: 'absolute',
    top: 8,
    height: 16,
    borderRadius: 4,
  },
  gapBlockFill: {
    width: '100%',
    height: '100%',
    backgroundColor: NatureColors.sage[200],
    borderRadius: 4,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: NatureColors.sage[400],
  },
  freeDay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  freeDayText: {
    fontSize: 14,
    fontWeight: '600',
    color: NatureColors.sage[600],
  },
  timelineHours: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingHorizontal: 4,
  },
  timelineHourLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: NatureColors.earth[400],
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: NatureColors.cream[50],
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 8,
    marginBottom: 20,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 15,
    fontWeight: '800',
    color: NatureColors.earth[800],
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: NatureColors.earth[500],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: NatureColors.cream[300],
  },
  tipContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: NatureColors.sage[50],
    borderRadius: 16,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: NatureColors.sage[500],
  },
  tipContainerHigh: {
    backgroundColor: NatureColors.terracotta[50],
    borderLeftColor: NatureColors.terracotta[500],
  },
  tipContainerMedium: {
    backgroundColor: NatureColors.cream[100],
    borderLeftColor: NatureColors.cream[600],
  },
  tipIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  tipEmoji: {
    fontSize: 18,
  },
  tipContent: {
    flex: 1,
  },
  tipLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: NatureColors.earth[500],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  tipText: {
    fontSize: 14,
    color: NatureColors.earth[700],
    lineHeight: 21,
    fontWeight: '500',
  },
});

// Topographic line SVG pattern component (simplified)
const TopographicBackground = () => (
  <View style={styles.topoContainer}>
    {[...Array(8)].map((_, i) => (
      <View
        key={i}
        style={[
          styles.topoLine,
          {
            top: 30 + i * 28,
            opacity: 0.04 + (i * 0.01),
            transform: [{ scaleX: 1 - (i * 0.08) }],
          },
        ]}
      />
    ))}
  </View>
);

export default function DashboardScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionsLoading, setActionsLoading] = useState(false);
  const [energyScore, setEnergyScore] = useState<EnergyScore | null>(null);
  const [checkInStatus, setCheckInStatus] = useState<CheckInStatus>({
    morning: false,
    midday: false,
    evening: false,
  });
  const [feedbackGiven, setFeedbackGiven] = useState(false);
  const [yesterdayScore, setYesterdayScore] = useState<number | null>(null);
  const [baseline, setBaseline] = useState<{ average: number; min: number; max: number } | null>(null);
  
  // Calendar / Mental Load state
  const [calendarMetrics, setCalendarMetrics] = useState<CognitiveLoadMetrics | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarEnabled, setCalendarEnabledState] = useState(false);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    if (!loading && energyScore) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [loading, energyScore]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      console.log('📊 Loading dashboard data...');
      setActionsLoading(true);

      const status = await getCheckInStatus();
      setCheckInStatus(status);

      const score = await getTodayEnergyScore();
      setEnergyScore(score);

      // Fetch comparison data
      const [yesterday, baselineData] = await Promise.all([
        getYesterdayScore(),
        getUserBaseline(),
      ]);
      setYesterdayScore(yesterday);
      setBaseline(baselineData);

      setFeedbackGiven(false);
      
      // Auto-sync calendar if enabled
      const calEnabled = await isCalendarEnabled();
      setCalendarEnabledState(calEnabled);
      if (calEnabled) {
        setCalendarLoading(true);
        try {
          await syncCalendarData(); // Sync first
          const metrics = await fetchTodayCalendarData();
          setCalendarMetrics(metrics);
        } catch (calErr) {
          console.error('Calendar sync error:', calErr);
        } finally {
          setCalendarLoading(false);
        }
      }
    } catch (err) {
      console.error('Error loading dashboard:', err);
    } finally {
      setLoading(false);
      setActionsLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const getNextCheckIn = (): { type: string; label: string; emoji: string } | null => {
    const hour = new Date().getHours();

    if (!checkInStatus.morning && hour < 12) {
      return { type: 'morning', label: 'Morning Check-In', emoji: '🌅' };
    }
    if (!checkInStatus.midday && hour >= 12 && hour < 17) {
      return { type: 'midday', label: 'Mid-Day Pulse', emoji: '☀️' };
    }
    if (!checkInStatus.evening && hour >= 17) {
      return { type: 'evening', label: 'Evening Reflection', emoji: '🌙' };
    }
    return null;
  };

  const handleCheckIn = (type: string) => {
    router.push(`/check-in?type=${type}`);
  };

  const handleFeedback = async (matched: boolean) => {
    if (energyScore && energyScore.id !== 'temp') {
      await submitFeedback(energyScore.id, matched);
    }
    setFeedbackGiven(true);
  };

  const nextCheckIn = getNextCheckIn();
  const completedCount = [checkInStatus.morning, checkInStatus.midday, checkInStatus.evening].filter(Boolean).length;

  // Pulsing animation for pending check-ins
  const pulseAnim = useRef(new Animated.Value(0)).current;
  
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: false,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: false,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  const pulseBorderColor = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(251, 191, 36, 0.3)', 'rgba(251, 191, 36, 1)'],
  });

  const pulseShadowOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.1, 0.5],
  });

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.loadingIconContainer}>
          <Text style={styles.loadingIcon}>🌿</Text>
        </View>
        <ActivityIndicator size="large" color={NatureColors.sage[500]} style={{ marginTop: 16 }} />
        <Text style={styles.loadingText}>Gathering your energy insights...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={NatureColors.sage[500]}
          colors={[NatureColors.sage[500]]}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* Topographic Background Pattern */}
      <TopographicBackground />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{getGreeting()}</Text>
          <Text style={styles.date}>
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'short',
              day: 'numeric',
            })}
          </Text>
        </View>
        <TouchableOpacity style={styles.headerButton}>
          <Text style={styles.headerButtonEmoji}>🍃</Text>
        </TouchableOpacity>
      </View>

      {/* Energy Score Hero - Main Focal Point */}
      {energyScore ? (
        <Animated.View
          style={[
            styles.energyHero,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            }
          ]}
        >
          <View style={[styles.energyHeroBg, { backgroundColor: getEnergyColor(energyScore.score) }]}>
            {/* Decorative circles */}
            <View style={[styles.decorCircle, styles.decorCircle1]} />
            <View style={[styles.decorCircle, styles.decorCircle2]} />
            <View style={[styles.decorCircle, styles.decorCircle3]} />

            <View style={styles.energyContent}>
              <Text style={styles.energyLabel}>ENERGY SCORE</Text>
              <View style={styles.energyScoreRow}>
                <Text style={styles.energyScoreValue}>
                  {energyScore.score.toFixed(1)}
                </Text>
                <Text style={styles.energyScoreUnit}>/ 10</Text>
              </View>
              <View style={styles.energyStatusRow}>
                <Text style={styles.energyStatusEmoji}>
                  {getEnergyLabel(energyScore.score).emoji}
                </Text>
                <Text style={styles.energyStatusText}>
                  {getEnergyLabel(energyScore.score).text}
                </Text>
              </View>

              {/* Day-over-day comparison */}
              {yesterdayScore !== null && (
                <View style={styles.comparisonRow}>
                  <Text style={styles.comparisonText}>
                    <Text style={energyScore.score > yesterdayScore ? styles.comparisonArrowUp : 
                      energyScore.score < yesterdayScore ? styles.comparisonArrowDown : null}>
                      {energyScore.score > yesterdayScore ? '↑' : energyScore.score < yesterdayScore ? '↓' : '→'}
                    </Text>
                    {' '}{Math.abs(energyScore.score - yesterdayScore).toFixed(1)} vs yesterday
                  </Text>
                </View>
              )}

              {/* Baseline context */}
              {baseline && !yesterdayScore && (
                <View style={styles.comparisonRow}>
                  <Text style={styles.comparisonText}>
                    Your typical: {baseline.min}–{baseline.max}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Semi-circular gauge visualization */}
          <View style={styles.gaugeContainer}>
            <View style={styles.gaugeBg}>
              <View
                style={[
                  styles.gaugeFill,
                  {
                    width: `${energyScore.score * 10}%`,
                    backgroundColor: getEnergyColor(energyScore.score),
                  }
                ]}
              />
            </View>
            <View style={styles.gaugeLabels}>
              <Text style={styles.gaugeLabel}>Low</Text>
              <Text style={styles.gaugeLabel}>High</Text>
            </View>
          </View>
        </Animated.View>
      ) : (
        <View style={styles.energyHeroEmpty}>
          <View style={styles.emptyIconContainer}>
            <Text style={styles.emptyIcon}>🌱</Text>
          </View>
          <Text style={styles.emptyTitle}>Ready to grow?</Text>
          <Text style={styles.emptySubtitle}>
            Complete your first check-in to see your energy bloom
          </Text>
        </View>
      )}

      {/* Unified Check-In Progress Section (replaces both Quick Check-In Card and Today's Journey) */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Today's Journey</Text>
          <Text style={styles.progressText}>{completedCount}/3</Text>
        </View>

        {/* Inline Progress Dots */}
        <View style={styles.checkInDotsRow}>
          {[
            { key: 'morning', emoji: '🌅', label: 'Morning', done: checkInStatus.morning },
            { key: 'midday', emoji: '☀️', label: 'Mid-Day', done: checkInStatus.midday },
            { key: 'evening', emoji: '🌙', label: 'Evening', done: checkInStatus.evening },
          ].map((item, index) => {
            const isPending = !item.done;
            const isNext = nextCheckIn?.type === item.key;
            const hour = new Date().getHours();
            const minutes = new Date().getMinutes();
            
            // Determine if this check-in is overdue (missed its time window)
            const isOverdue = isPending && (
              (item.key === 'morning' && hour >= 11) ||           // Morning overdue after 11am
              (item.key === 'midday' && hour >= 15) ||            // Mid-day overdue after 3pm
              (item.key === 'evening' && (hour > 23 || (hour === 23 && minutes >= 30)))  // Evening overdue after 11:30pm
            );
            
            const dotContent = (
              <TouchableOpacity
                key={item.key}
                style={[
                  styles.checkInDot,
                  item.done && styles.checkInDotDone,
                  isNext && styles.checkInDotActive,
                ]}
                onPress={() => !item.done && handleCheckIn(item.key)}
                disabled={item.done}
                activeOpacity={0.7}
              >
                <Text style={styles.checkInDotEmoji}>{item.emoji}</Text>
                <Text style={[
                  styles.checkInDotLabel,
                  item.done && styles.checkInDotLabelDone,
                ]}>{item.label}</Text>
                {item.done && <Text style={styles.checkInDotCheck}>✓</Text>}
              </TouchableOpacity>
            );

            // Only show pulsing yellow border for OVERDUE check-ins (missed time window)
            if (isOverdue) {
              return (
                <Animated.View
                  key={item.key}
                  style={[
                    styles.checkInDotPulseWrapper,
                    {
                      borderColor: pulseBorderColor,
                      shadowOpacity: pulseShadowOpacity,
                    },
                  ]}
                >
                  {dotContent}
                </Animated.View>
              );
            }

            // Pending but not overdue, or done items - regular wrapper
            return (
              <View key={item.key} style={styles.checkInDotWrapper}>
                {dotContent}
              </View>
            );
          })}
        </View>

        {/* Next Check-In CTA Button */}
        {nextCheckIn && (
          <TouchableOpacity
            style={styles.checkInCTAButton}
            onPress={() => handleCheckIn(nextCheckIn.type)}
            activeOpacity={0.85}
          >
            <Text style={styles.checkInCTAEmoji}>{nextCheckIn.emoji}</Text>
            <View style={styles.checkInCTAText}>
              <Text style={styles.checkInCTATitle}>{nextCheckIn.label}</Text>
              <Text style={styles.checkInCTASub}>Quick 10-second reflection</Text>
            </View>
            <Text style={styles.checkInCTAArrow}>→</Text>
          </TouchableOpacity>
        )}

        {!nextCheckIn && completedCount === 3 && (
          <View style={styles.allDoneCard}>
            <Text style={styles.allDoneEmoji}>🎉</Text>
            <Text style={styles.allDoneText}>All check-ins complete!</Text>
          </View>
        )}
      </View>

      {/* Today's Mental Load Card - Calendar Integration */}
      {calendarEnabled && (
        <TodaysMentalLoadCard 
          metrics={calendarMetrics} 
          loading={calendarLoading} 
        />
      )}

      {/* AI Insight Card */}
      {energyScore && (
        <View style={styles.listCard}>
          <View style={styles.listCardHeader}>
            <View style={styles.listCardIconWrap}>
              <Text style={styles.listCardIcon}>✨</Text>
            </View>
            <Text style={styles.listCardTitle}>Today's Insight</Text>
          </View>
          <Text style={styles.listCardContent}>{energyScore.explanation}</Text>

          {!feedbackGiven ? (
            <View style={styles.feedbackRow}>
              <Text style={styles.feedbackQuestion}>Did this resonate?</Text>
              <View style={styles.feedbackButtons}>
                <TouchableOpacity
                  style={styles.feedbackBtnYes}
                  onPress={() => handleFeedback(true)}
                >
                  <Text style={styles.feedbackBtnText}>👍 Yes</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.feedbackBtnNo}
                  onPress={() => handleFeedback(false)}
                >
                  <Text style={styles.feedbackBtnNoText}>👎 Not quite</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.feedbackThanks}>
              <Text style={styles.feedbackThanksText}>Thank you for the feedback! 🌱</Text>
            </View>
          )}
        </View>
      )}

      {/* Actions for the Day */}
      {energyScore && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Actions for the Day</Text>
            <View style={styles.aiBadge}>
              <Text style={styles.aiBadgeText}>✨ For You</Text>
            </View>
          </View>

          {/* Quick Actions */}
          <Text style={styles.actionsSectionLabel}>⚡ Quick Actions</Text>
          <View style={styles.microActionsRow}>
            {getQuickActions(energyScore.score).map((action, index) => (
              <TouchableOpacity key={index} style={styles.microAction}>
                <View style={styles.microActionIcon}>
                  <Text style={styles.microActionEmoji}>{action.emoji}</Text>
                </View>
                <Text style={styles.microActionText}>{action.action}</Text>
                {action.duration ? (
                  <Text style={styles.microActionDuration}>{action.duration}</Text>
                ) : null}
              </TouchableOpacity>
            ))}
          </View>

          {/* Smart Actions (AI Personalized) */}
          {energyScore.actions && energyScore.actions.length > 0 && (
            <>
              <Text style={styles.actionsSectionLabel}>🎯 Smart Actions</Text>
              <View style={styles.personalizedActions}>
                {energyScore.actions.slice(0, 2).map((action, index) => (
                  <View key={action.id} style={styles.actionCard}>
                    <View style={styles.actionNumber}>
                      <Text style={styles.actionNumberText}>{index + 1}</Text>
                    </View>
                    <View style={styles.actionContent}>
                      <Text style={styles.actionTitle}>{action.title}</Text>
                      {action.reason && (
                        <Text style={styles.actionReason}>{action.reason}</Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>
      )}

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
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

  // Topographic background
  topoContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 350,
    overflow: 'hidden',
  },
  topoLine: {
    position: 'absolute',
    left: -20,
    right: -20,
    height: 120,
    borderRadius: 100,
    borderWidth: 1.5,
    borderColor: NatureColors.sage[400],
  },

  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: NatureColors.cream[100],
  },
  loadingIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: NatureColors.sage[100],
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingIcon: {
    fontSize: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: NatureColors.earth[600],
    fontWeight: '600',
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  greeting: {
    fontSize: 30,
    fontWeight: '700',
    color: NatureColors.earth[800],
    letterSpacing: -0.5,
  },
  date: {
    fontSize: 15,
    color: NatureColors.earth[500],
    marginTop: 4,
    fontWeight: '500',
  },
  headerButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: NatureColors.sage[100],
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerButtonEmoji: {
    fontSize: 26,
  },

  // Energy Hero Card
  energyHero: {
    marginBottom: 20,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#fff',
    shadowColor: NatureColors.earth[900],
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  energyHeroBg: {
    padding: 28,
    position: 'relative',
    overflow: 'hidden',
  },
  decorCircle: {
    position: 'absolute',
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  decorCircle1: {
    width: 160,
    height: 160,
    top: -40,
    right: -40,
  },
  decorCircle2: {
    width: 100,
    height: 100,
    bottom: -30,
    left: 20,
  },
  decorCircle3: {
    width: 60,
    height: 60,
    top: 20,
    left: -20,
  },
  energyContent: {
    alignItems: 'center',
  },
  energyLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 2,
    marginBottom: 8,
  },
  energyScoreRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  energyScoreValue: {
    fontSize: 72,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -2,
    lineHeight: 76,
  },
  energyScoreUnit: {
    fontSize: 28,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 12,
    marginLeft: 2,
  },
  energyStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  energyStatusEmoji: {
    fontSize: 18,
    marginRight: 8,
  },
  energyStatusText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  gaugeContainer: {
    padding: 20,
    paddingTop: 16,
    backgroundColor: '#fff',
  },
  gaugeBg: {
    height: 10,
    backgroundColor: NatureColors.cream[200],
    borderRadius: 5,
    overflow: 'hidden',
  },
  gaugeFill: {
    height: '100%',
    borderRadius: 5,
  },
  gaugeLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  gaugeLabel: {
    fontSize: 12,
    color: NatureColors.earth[400],
    fontWeight: '500',
  },

  // Empty State
  energyHeroEmpty: {
    backgroundColor: '#fff',
    borderRadius: 28,
    padding: 40,
    marginBottom: 20,
    alignItems: 'center',
    shadowColor: NatureColors.earth[900],
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
  },
  emptyIconContainer: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: NatureColors.sage[100],
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyIcon: {
    fontSize: 44,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: NatureColors.earth[800],
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: NatureColors.earth[500],
    textAlign: 'center',
    lineHeight: 22,
  },

  // Check-In Card
  checkInCard: {
    backgroundColor: NatureColors.terracotta[500],
    borderRadius: 22,
    padding: 20,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: NatureColors.terracotta[700],
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
  checkInLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  checkInIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  checkInEmoji: {
    fontSize: 28,
  },
  checkInTextWrap: {
    flex: 1,
  },
  checkInTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  checkInSub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 3,
    fontWeight: '500',
  },
  checkInArrow: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkInArrowText: {
    fontSize: 22,
    color: '#fff',
    fontWeight: '600',
  },

  // List Card (AI Insight)
  listCard: {
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 22,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: NatureColors.sage[500],
    shadowColor: NatureColors.earth[900],
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  listCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  listCardIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: NatureColors.sage[100],
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  listCardIcon: {
    fontSize: 18,
  },
  listCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: NatureColors.sage[700],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  listCardContent: {
    fontSize: 16,
    lineHeight: 26,
    color: NatureColors.earth[700],
    fontWeight: '500',
  },
  feedbackRow: {
    marginTop: 18,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: NatureColors.cream[300],
  },
  feedbackQuestion: {
    fontSize: 14,
    color: NatureColors.earth[500],
    fontWeight: '600',
    marginBottom: 12,
  },
  feedbackButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  feedbackBtnYes: {
    backgroundColor: NatureColors.sage[500],
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 14,
  },
  feedbackBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  feedbackBtnNo: {
    backgroundColor: NatureColors.cream[200],
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 14,
  },
  feedbackBtnNoText: {
    color: NatureColors.earth[600],
    fontSize: 14,
    fontWeight: '600',
  },
  feedbackThanks: {
    marginTop: 18,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: NatureColors.cream[300],
  },
  feedbackThanksText: {
    fontSize: 15,
    color: NatureColors.sage[600],
    textAlign: 'center',
    fontWeight: '600',
  },

  // Sections
  section: {
    marginBottom: 22,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: NatureColors.earth[800],
    marginBottom: 14,
  },
  aiBadge: {
    backgroundColor: NatureColors.terracotta[100],
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  aiBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: NatureColors.terracotta[600],
  },

  // Action Cards
  actionCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    shadowColor: NatureColors.earth[900],
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  actionNumber: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: NatureColors.terracotta[100],
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  actionNumberText: {
    fontSize: 14,
    fontWeight: '700',
    color: NatureColors.terracotta[600],
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 16,
    color: NatureColors.earth[800],
    fontWeight: '600',
    lineHeight: 24,
  },
  actionReason: {
    fontSize: 14,
    color: NatureColors.earth[500],
    marginTop: 6,
    lineHeight: 20,
  },

  // Loading skeletons
  actionCardLoading: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  actionLoadingNum: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: NatureColors.cream[300],
    marginRight: 14,
  },
  actionLoadingContent: {
    flex: 1,
  },
  actionLoadingTitle: {
    height: 18,
    backgroundColor: NatureColors.cream[300],
    borderRadius: 6,
    width: '75%',
  },
  actionLoadingDesc: {
    height: 14,
    backgroundColor: NatureColors.cream[200],
    borderRadius: 6,
    width: '55%',
    marginTop: 10,
  },

  // Progress Section
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    marginTop: -6,
  },
  progressIndicator: {
    flex: 1,
    height: 8,
    backgroundColor: NatureColors.cream[300],
    borderRadius: 4,
    marginRight: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: NatureColors.sage[500],
    borderRadius: 4,
  },
  progressText: {
    fontSize: 14,
    color: NatureColors.earth[500],
    fontWeight: '600',
  },
  checkInCards: {
    flexDirection: 'row',
    gap: 12,
  },
  checkInProgressCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    alignItems: 'center',
    shadowColor: NatureColors.earth[900],
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  checkInProgressCardDone: {
    backgroundColor: NatureColors.sage[50],
    borderColor: NatureColors.sage[300],
  },
  checkInProgressEmoji: {
    fontSize: 28,
    marginBottom: 8,
  },
  checkInProgressLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: NatureColors.earth[500],
    marginBottom: 10,
  },
  checkInProgressLabelDone: {
    color: NatureColors.sage[700],
  },
  checkInProgressStatus: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: NatureColors.cream[200],
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkInProgressStatusDone: {
    backgroundColor: NatureColors.sage[500],
  },
  checkInProgressStatusText: {
    fontSize: 14,
    fontWeight: '700',
    color: NatureColors.earth[400],
  },

  // Day-over-day comparison
  comparisonRow: {
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  comparisonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  comparisonArrowUp: {
    color: '#22C55E',
    fontWeight: '800',
  },
  comparisonArrowDown: {
    color: '#EF4444',
    fontWeight: '800',
  },

  // Micro-actions card
  microActionsCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: NatureColors.earth[900],
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: NatureColors.cream[200],
  },
  microActionsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: NatureColors.earth[600],
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 16,
    textAlign: 'center',
  },
  actionsSectionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: NatureColors.earth[700],
    marginBottom: 12,
    marginTop: 4,
  },
  microActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  microAction: {
    alignItems: 'center',
    flex: 1,
  },
  microActionIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: NatureColors.sage[100],
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  microActionEmoji: {
    fontSize: 26,
  },
  microActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: NatureColors.earth[700],
    textAlign: 'center',
  },
  microActionDuration: {
    fontSize: 11,
    fontWeight: '500',
    color: NatureColors.sage[600],
    marginTop: 3,
  },

  // Unified Check-In Progress
  checkInDotsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  checkInDotPulseWrapper: {
    flex: 1,
    marginHorizontal: 4,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'rgba(251, 191, 36, 0.5)',
    shadowColor: '#FBBF24',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 8,
    elevation: 4,
  },
  checkInDotWrapper: {
    flex: 1,
    marginHorizontal: 4,
  },
  checkInDot: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: NatureColors.cream[100],
    borderRadius: 16,
  },
  checkInDotDone: {
    backgroundColor: NatureColors.sage[50],
    borderWidth: 1,
    borderColor: NatureColors.sage[300],
  },
  checkInDotActive: {
    backgroundColor: NatureColors.terracotta[50],
  },
  checkInDotEmoji: {
    fontSize: 24,
    marginBottom: 4,
  },
  checkInDotLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: NatureColors.earth[500],
  },
  checkInDotLabelDone: {
    color: NatureColors.sage[700],
  },
  checkInDotCheck: {
    position: 'absolute',
    top: 6,
    right: 8,
    fontSize: 12,
    color: NatureColors.sage[600],
    fontWeight: '700',
  },

  // Check-In CTA Button
  checkInCTAButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: NatureColors.sage[500],
    borderRadius: 16,
    padding: 16,
  },
  checkInCTAEmoji: {
    fontSize: 28,
    marginRight: 14,
  },
  checkInCTAText: {
    flex: 1,
  },
  checkInCTATitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  checkInCTASub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  checkInCTAArrow: {
    fontSize: 24,
    color: '#fff',
    fontWeight: '300',
  },

  // All Done Card
  allDoneCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: NatureColors.sage[100],
    borderRadius: 16,
    padding: 16,
  },
  allDoneEmoji: {
    fontSize: 24,
    marginRight: 10,
  },
  allDoneText: {
    fontSize: 16,
    fontWeight: '600',
    color: NatureColors.sage[700],
  },

  // Personalized Actions
  personalizedActions: {
    marginTop: 16,
  },

  bottomSpacer: {
    height: 30,
  },
});

