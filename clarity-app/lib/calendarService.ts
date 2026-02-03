/**
 * Calendar Service for Cognitive Load Tracking
 * Uses expo-calendar to access native device calendars (Apple Calendar, Google Calendar)
 * Calculates cognitive load metrics from meeting data
 */

import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';

const CALENDAR_ENABLED_KEY = '@clarity_calendar_enabled';
const CALENDAR_LAST_SYNC_KEY = '@clarity_calendar_last_sync';
const CALENDAR_USE_MOCK_KEY = '@clarity_calendar_use_mock';

// Check if running in Expo Go
const isExpoGo = Constants.appOwnership === 'expo';

/**
 * Check if using mock calendar data
 */
export async function isUsingMockCalendarData(): Promise<boolean> {
    const value = await AsyncStorage.getItem(CALENDAR_USE_MOCK_KEY);
    return value === 'true';
}

/**
 * Set whether to use mock calendar data (for testing in simulator)
 */
export async function setUseMockCalendarData(enabled: boolean): Promise<void> {
    await AsyncStorage.setItem(CALENDAR_USE_MOCK_KEY, enabled ? 'true' : 'false');
    if (enabled) {
        // Also enable calendar when enabling mock
        await setCalendarEnabled(true);
    }
}

/**
 * Generate realistic mock calendar metrics for a given date
 */
function generateMockCalendarMetrics(date: Date): CognitiveLoadMetrics {
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    
    if (isWeekend) {
        // Weekends: minimal or no meetings
        const hasMeeting = Math.random() > 0.7;
        return {
            meetingCount: hasMeeting ? 1 : 0,
            meetingHours: hasMeeting ? 0.5 : 0,
            meetingDensity: hasMeeting ? 0.06 : 0,
            longestGap: 480,
            shortGaps: 0,
            lateMeetings: 0,
            backToBack: 0,
            firstMeetingTime: hasMeeting ? '10:00 AM' : null,
            lastMeetingTime: hasMeeting ? '10:30 AM' : null,
        };
    }
    
    // Weekdays: Variable meeting loads
    // Monday/Friday tend to be lighter, Tue-Thu heavier
    const isHeavyDay = dayOfWeek >= 2 && dayOfWeek <= 4;
    
    const baseMeetings = isHeavyDay ? 4 : 2;
    const variance = Math.floor(Math.random() * 3) - 1; // -1, 0, or 1
    const meetingCount = Math.max(0, baseMeetings + variance);
    
    const avgMeetingLength = 0.5 + Math.random() * 0.5; // 30-60 min avg
    const meetingHours = Math.round(meetingCount * avgMeetingLength * 10) / 10;
    const meetingDensity = Math.min(meetingHours / 9, 0.9); // Cap at 90%
    
    const backToBack = meetingCount >= 3 ? Math.floor(Math.random() * (meetingCount - 1)) : 0;
    const lateMeetings = Math.random() > 0.7 && meetingCount > 2 ? 1 : 0;
    const shortGaps = Math.floor(meetingCount * Math.random() * 0.5);
    
    const longestGap = meetingCount > 0 
        ? Math.floor((9 - meetingHours) / (meetingCount + 1) * 60)
        : 480;
    
    // Generate realistic times
    const firstHour = 9 + Math.floor(Math.random() * 2);
    const lastHour = Math.min(17, firstHour + Math.ceil(meetingHours) + meetingCount);
    
    return {
        meetingCount,
        meetingHours,
        meetingDensity: Math.round(meetingDensity * 100) / 100,
        longestGap: Math.max(15, longestGap),
        shortGaps,
        lateMeetings,
        backToBack,
        firstMeetingTime: meetingCount > 0 ? `${firstHour}:00 AM` : null,
        lastMeetingTime: meetingCount > 0 ? `${lastHour > 12 ? lastHour - 12 : lastHour}:00 ${lastHour >= 12 ? 'PM' : 'AM'}` : null,
    };
}

/**
 * Cognitive load metrics calculated from calendar events
 */
export interface CognitiveLoadMetrics {
    meetingCount: number;           // Total meetings for the day
    meetingHours: number;           // Total hours in meetings
    meetingDensity: number;         // Percentage of work hours (9am-6pm) in meetings
    longestGap: number;             // Longest break between meetings (minutes)
    shortGaps: number;              // Count of gaps <30 min (fragmented day)
    lateMeetings: number;           // Meetings after 5pm (affects recovery)
    backToBack: number;             // Count of back-to-back meetings (<=5 min gap)
    firstMeetingTime: string | null; // Time of first meeting
    lastMeetingTime: string | null;  // Time of last meeting
}

export interface DailyCognitiveLoad {
    date: string;  // YYYY-MM-DD format
    metrics: CognitiveLoadMetrics;
}

/**
 * Check if calendar is supported (not in Expo Go)
 */
export function isCalendarSupported(): boolean {
    return !isExpoGo;
}

/**
 * Check if calendar integration is enabled
 */
export async function isCalendarEnabled(): Promise<boolean> {
    const value = await AsyncStorage.getItem(CALENDAR_ENABLED_KEY);
    return value === 'true';
}

/**
 * Set calendar integration enabled state
 */
export async function setCalendarEnabled(enabled: boolean): Promise<void> {
    await AsyncStorage.setItem(CALENDAR_ENABLED_KEY, enabled ? 'true' : 'false');
}

/**
 * Request calendar permissions
 */
export async function requestCalendarPermissions(): Promise<boolean> {
    if (isExpoGo) {
        console.log('⚠️ Calendar not available in Expo Go');
        return false;
    }

    try {
        const { status } = await Calendar.requestCalendarPermissionsAsync();
        const granted = status === 'granted';

        if (granted) {
            console.log('✅ Calendar permissions granted');
            await setCalendarEnabled(true);
        } else {
            console.log('❌ Calendar permissions denied');
        }

        return granted;
    } catch (error) {
        console.error('Error requesting calendar permissions:', error);
        return false;
    }
}

/**
 * Check if calendar permissions are granted
 */
export async function checkCalendarPermissions(): Promise<boolean> {
    if (isExpoGo) return false;

    try {
        const { status } = await Calendar.getCalendarPermissionsAsync();
        return status === 'granted';
    } catch (error) {
        console.error('Error checking calendar permissions:', error);
        return false;
    }
}

/**
 * Get all accessible calendars
 */
export async function getCalendars(): Promise<Calendar.Calendar[]> {
    try {
        const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
        // Filter to only primary/relevant calendars
        return calendars.filter(cal =>
            cal.allowsModifications !== false &&
            cal.source?.type !== 'birthdays' &&
            cal.source?.type !== 'subscribed'
        );
    } catch (error) {
        console.error('Error getting calendars:', error);
        return [];
    }
}

/**
 * Fetch events for a specific date range
 */
async function fetchEvents(
    startDate: Date,
    endDate: Date
): Promise<Calendar.Event[]> {
    try {
        const calendars = await getCalendars();
        if (calendars.length === 0) {
            console.log('⚠️ No calendars found');
            return [];
        }

        const calendarIds = calendars.map(cal => cal.id);

        const events = await Calendar.getEventsAsync(
            calendarIds,
            startDate,
            endDate
        );

        // Filter out all-day events and focus on meetings
        return events.filter(event =>
            !event.allDay &&
            event.startDate &&
            event.endDate
        );
    } catch (error) {
        console.error('Error fetching calendar events:', error);
        return [];
    }
}

/**
 * Calculate cognitive load metrics from a list of events
 * Privacy-first: Only uses start/end times, not titles/descriptions
 */
function calculateMetrics(events: Calendar.Event[], targetDate: Date): CognitiveLoadMetrics {
    const metrics: CognitiveLoadMetrics = {
        meetingCount: 0,
        meetingHours: 0,
        meetingDensity: 0,
        longestGap: 0,
        shortGaps: 0,
        lateMeetings: 0,
        backToBack: 0,
        firstMeetingTime: null,
        lastMeetingTime: null,
    };

    if (events.length === 0) return metrics;

    // Sort events by start time
    const sortedEvents = [...events].sort((a, b) =>
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    );

    metrics.meetingCount = sortedEvents.length;

    // Work hours: 9am to 6pm (9 hours = 540 minutes)
    const workDayMinutes = 540;
    const workStartHour = 9;
    const lateHour = 17; // 5pm

    let totalMeetingMinutes = 0;
    const gaps: number[] = [];

    sortedEvents.forEach((event, index) => {
        const start = new Date(event.startDate);
        const end = new Date(event.endDate);

        const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
        totalMeetingMinutes += durationMinutes;

        // Track first and last meeting times
        const timeStr = start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        if (index === 0) {
            metrics.firstMeetingTime = timeStr;
        }
        if (index === sortedEvents.length - 1) {
            metrics.lastMeetingTime = end.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        }

        // Check for late meetings (starting after 5pm)
        if (start.getHours() >= lateHour) {
            metrics.lateMeetings++;
        }

        // Calculate gap to next meeting
        if (index < sortedEvents.length - 1) {
            const nextEvent = sortedEvents[index + 1];
            const nextStart = new Date(nextEvent.startDate);
            const gapMinutes = (nextStart.getTime() - end.getTime()) / (1000 * 60);

            if (gapMinutes > 0) {
                gaps.push(gapMinutes);

                // Short gap (fragmented time)
                if (gapMinutes < 30) {
                    metrics.shortGaps++;
                }

                // Back-to-back (5 min or less gap)
                if (gapMinutes <= 5) {
                    metrics.backToBack++;
                }
            } else {
                // Overlapping meetings count as back-to-back
                metrics.backToBack++;
            }
        }
    });

    metrics.meetingHours = Math.round(totalMeetingMinutes / 60 * 10) / 10;
    metrics.meetingDensity = Math.round((totalMeetingMinutes / workDayMinutes) * 100) / 100;
    metrics.longestGap = gaps.length > 0 ? Math.round(Math.max(...gaps)) : 0;

    return metrics;
}

/**
 * Fetch today's calendar cognitive load metrics
 */
export async function fetchTodayCalendarData(): Promise<CognitiveLoadMetrics | null> {
    console.log('📅 [Calendar] Fetching today\'s data...');

    // Check if using mock data
    const useMock = await isUsingMockCalendarData();
    if (useMock) {
        console.log('🧪 [Calendar] Using mock data');
        const today = new Date();
        const mockMetrics = generateMockCalendarMetrics(today);
        console.log(`✅ [Calendar] Mock metrics:`, {
            meetings: mockMetrics.meetingCount,
            hours: mockMetrics.meetingHours,
            density: `${Math.round(mockMetrics.meetingDensity * 100)}%`,
        });
        return mockMetrics;
    }

    const hasPermission = await checkCalendarPermissions();
    if (!hasPermission) {
        console.log('❌ [Calendar] No permission');
        return null;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const events = await fetchEvents(today, tomorrow);
    console.log(`📊 [Calendar] Found ${events.length} events today`);

    const metrics = calculateMetrics(events, today);

    console.log(`✅ [Calendar] Metrics:`, {
        meetings: metrics.meetingCount,
        hours: metrics.meetingHours,
        density: `${Math.round(metrics.meetingDensity * 100)}%`,
        backToBack: metrics.backToBack,
    });

    return metrics;
}

/**
 * Fetch week's calendar data (last 7 days)
 */
export async function fetchWeekCalendarData(): Promise<DailyCognitiveLoad[]> {
    console.log('📅 [Calendar] Fetching week data...');

    // Check if using mock data
    const useMock = await isUsingMockCalendarData();
    
    if (!useMock) {
        const hasPermission = await checkCalendarPermissions();
        if (!hasPermission) {
            console.log('❌ [Calendar] No permission');
            return [];
        }
    }

    const weekData: DailyCognitiveLoad[] = [];

    // Get last 7 days
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        date.setHours(0, 0, 0, 0);

        let metrics: CognitiveLoadMetrics;

        if (useMock) {
            metrics = generateMockCalendarMetrics(date);
        } else {
            const nextDay = new Date(date);
            nextDay.setDate(nextDay.getDate() + 1);

            const events = await fetchEvents(date, nextDay);
            metrics = calculateMetrics(events, date);
        }

        weekData.push({
            date: date.toISOString().split('T')[0],
            metrics,
        });
    }

    const totalMeetings = weekData.reduce((sum, d) => sum + d.metrics.meetingCount, 0);
    console.log(`✅ [Calendar] Week done. ${totalMeetings} total meetings across 7 days`);

    return weekData;
}

/**
 * Sync today's calendar data to Supabase
 */
export async function syncCalendarData(): Promise<boolean> {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
            console.log('❌ No authenticated user for calendar sync');
            return false;
        }

        const userId = session.user.id;
        const metrics = await fetchTodayCalendarData();

        if (!metrics) {
            console.log('⚠️ No calendar data to sync');
            return false;
        }

        const today = new Date().toISOString().split('T')[0];

        // Upsert calendar data
        const { error } = await supabase
            .from('health_data')
            .upsert({
                user_id: userId,
                type: 'calendar',
                source: Platform.OS === 'ios' ? 'apple_calendar' : 'google_calendar',
                data: metrics,
                source_date: today,
            }, {
                onConflict: 'user_id,type,source_date',
            });

        if (error) {
            console.error('Error syncing calendar data:', error);
            return false;
        }

        // Update last sync time
        await AsyncStorage.setItem(CALENDAR_LAST_SYNC_KEY, new Date().toISOString());

        console.log('✅ Calendar data synced to Supabase');
        return true;
    } catch (error) {
        console.error('Error in calendar sync:', error);
        return false;
    }
}

/**
 * Sync week's calendar data to Supabase
 */
export async function syncWeekCalendarData(): Promise<boolean> {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
            console.log('❌ No authenticated user for calendar sync');
            return false;
        }

        const userId = session.user.id;
        const weekData = await fetchWeekCalendarData();

        if (weekData.length === 0) {
            console.log('⚠️ No calendar data to sync');
            return false;
        }

        // Prepare upsert data
        // Note: 'source' column removed as it may not exist in older schemas
        const upsertData = weekData.map(day => ({
            user_id: userId,
            type: 'calendar',
            data: {
                ...day.metrics,
                platform: Platform.OS === 'ios' ? 'apple_calendar' : 'google_calendar',
            },
            source_date: day.date,
        }));

        // Upsert all days
        for (const dayData of upsertData) {
            const { error } = await supabase
                .from('health_data')
                .upsert(dayData, {
                    onConflict: 'user_id,type,source_date',
                });

            if (error) {
                console.error(`Error syncing calendar data for ${dayData.source_date}:`, error);
            }
        }

        // Update last sync time
        await AsyncStorage.setItem(CALENDAR_LAST_SYNC_KEY, new Date().toISOString());

        console.log('✅ Week calendar data synced to Supabase');
        return true;
    } catch (error) {
        console.error('Error in week calendar sync:', error);
        return false;
    }
}

/**
 * Get the last calendar sync time
 */
export async function getLastCalendarSyncTime(): Promise<Date | null> {
    try {
        const timestamp = await AsyncStorage.getItem(CALENDAR_LAST_SYNC_KEY);
        return timestamp ? new Date(timestamp) : null;
    } catch {
        return null;
    }
}

/**
 * Format last sync time for display
 */
export function formatLastCalendarSync(date: Date | null): string {
    if (!date) return 'Never';

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;

    return date.toLocaleDateString();
}

/**
 * Get cognitive load score (0-10) from metrics
 * Higher score = more cognitive strain
 */
export function getCognitiveLoadScore(metrics: CognitiveLoadMetrics): number {
    let score = 0;

    // Meeting hours impact (0-3 points)
    if (metrics.meetingHours >= 6) score += 3;
    else if (metrics.meetingHours >= 4) score += 2;
    else if (metrics.meetingHours >= 2) score += 1;

    // Meeting density impact (0-2 points)
    if (metrics.meetingDensity >= 0.6) score += 2;
    else if (metrics.meetingDensity >= 0.4) score += 1;

    // Back-to-back meetings impact (0-2 points)
    if (metrics.backToBack >= 4) score += 2;
    else if (metrics.backToBack >= 2) score += 1;

    // Short gaps / fragmentation (0-2 points)
    if (metrics.shortGaps >= 3) score += 2;
    else if (metrics.shortGaps >= 1) score += 1;

    // Late meetings impact (0-1 point)
    if (metrics.lateMeetings >= 1) score += 1;

    return Math.min(10, score);
}

/**
 * Get cognitive load label based on score
 */
export function getCognitiveLoadLabel(score: number): { label: string; emoji: string; color: string } {
    if (score <= 2) return { label: 'Light', emoji: '🌿', color: '#6B9B59' };
    if (score <= 4) return { label: 'Moderate', emoji: '🌤️', color: '#E3CBAA' };
    if (score <= 6) return { label: 'Heavy', emoji: '⚡', color: '#ED8B6B' };
    if (score <= 8) return { label: 'Intense', emoji: '🔥', color: '#E2714D' };
    return { label: 'Overwhelming', emoji: '💥', color: '#C2503D' };
}

/**
 * Get a smart, actionable tip based on today's meeting metrics
 * Tips are prioritized by mental health impact
 */
export function getSmartTip(metrics: CognitiveLoadMetrics): { tip: string; emoji: string; priority: 'high' | 'medium' | 'low' } {
    // No meetings = celebration!
    if (metrics.meetingCount === 0) {
        return {
            tip: "Meeting-free day! Great opportunity for deep work and recovery.",
            emoji: "🌿",
            priority: 'low'
        };
    }

    // Prioritized tips based on mental health impact

    // Late meetings affect sleep/recovery most
    if (metrics.lateMeetings >= 1) {
        return {
            tip: "Late meeting today. Plan 15-min wind-down time before bed to protect your sleep.",
            emoji: "🌙",
            priority: 'high'
        };
    }

    // Back-to-back meetings cause cognitive fatigue
    if (metrics.backToBack >= 3) {
        return {
            tip: `${metrics.backToBack} back-to-back meetings. Try a 2-min breathing break between each.`,
            emoji: "🫁",
            priority: 'high'
        };
    }

    if (metrics.backToBack >= 2) {
        return {
            tip: "Some back-to-back meetings today. Stand up and stretch between them.",
            emoji: "🧘",
            priority: 'medium'
        };
    }

    // Very heavy meeting day
    if (metrics.meetingDensity >= 0.6) {
        return {
            tip: "Heavy meeting day ahead. Protect at least 15 min for lunch without screens.",
            emoji: "🍽️",
            priority: 'high'
        };
    }

    // Fragmented day (many short gaps)
    if (metrics.shortGaps >= 3) {
        return {
            tip: "Fragmented schedule today. Use any 15-min gap for a quick walk.",
            emoji: "🚶",
            priority: 'medium'
        };
    }

    // Moderate meeting load
    if (metrics.meetingHours >= 4) {
        return {
            tip: `${metrics.meetingHours.toFixed(1)} hours of meetings. Block 10 min after your longest meeting.`,
            emoji: "⏰",
            priority: 'medium'
        };
    }

    // Light load but some meetings
    if (metrics.longestGap >= 60) {
        return {
            tip: `Good schedule! You have a ${Math.round(metrics.longestGap / 60)}-hour break. Great for focused work.`,
            emoji: "✨",
            priority: 'low'
        };
    }

    // Default tip
    return {
        tip: `${metrics.meetingCount} meetings today (${metrics.meetingHours.toFixed(1)} hrs). Pace yourself.`,
        emoji: "📅",
        priority: 'low'
    };
}

/**
 * Get simplified time blocks for timeline visualization
 * Returns periods of meetings and gaps
 */
export interface TimeBlock {
    type: 'meeting' | 'gap';
    label: string;
    duration: string;
}

export function getTimeBlocks(metrics: CognitiveLoadMetrics): TimeBlock[] {
    const blocks: TimeBlock[] = [];

    if (metrics.meetingCount === 0) {
        blocks.push({
            type: 'gap',
            label: 'All day',
            duration: 'Meeting-free'
        });
        return blocks;
    }

    // Show first meeting block
    if (metrics.firstMeetingTime) {
        blocks.push({
            type: 'meeting',
            label: `First: ${metrics.firstMeetingTime}`,
            duration: ''
        });
    }

    // Show total meeting time
    blocks.push({
        type: 'meeting',
        label: `Total meetings`,
        duration: `${metrics.meetingHours.toFixed(1)} hrs`
    });

    // Show longest break if meaningful
    if (metrics.longestGap >= 30) {
        const gapHours = metrics.longestGap >= 60
            ? `${(metrics.longestGap / 60).toFixed(1)} hrs`
            : `${metrics.longestGap} min`;
        blocks.push({
            type: 'gap',
            label: 'Longest break',
            duration: gapHours
        });
    }

    // Show last meeting if different from first
    if (metrics.lastMeetingTime && metrics.lastMeetingTime !== metrics.firstMeetingTime) {
        blocks.push({
            type: 'meeting',
            label: `Ends: ${metrics.lastMeetingTime}`,
            duration: ''
        });
    }

    return blocks;
}

