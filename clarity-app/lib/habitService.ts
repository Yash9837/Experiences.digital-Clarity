import { Platform } from 'react-native';
import { supabase } from './supabase';

// API URL - use appropriate address based on platform
const API_URL = __DEV__
    ? Platform.OS === 'android'
        ? 'http://10.0.2.2:3000/api'  // Android emulator
        : 'http://localhost:3000/api'  // iOS simulator
    : 'https://your-production-api.com/api';

// ============ TYPES ============

export interface DailyHabit {
    // Caffeine
    caffeine_cups?: number;
    caffeine_late?: boolean;
    
    // Sleep
    sleep_hours?: number;
    sleep_quality?: 'poor' | 'fair' | 'good' | 'excellent';
    
    // Alcohol
    alcohol_drinks?: number;
    
    // Exercise
    exercise_done?: boolean;
    exercise_type?: string;
    exercise_duration?: number;
    exercise_intensity?: 'light' | 'moderate' | 'intense';
    
    // Meals
    meals_count?: number;
    meals_skipped?: string;
    water_glasses?: number;
    
    // Screen
    screen_time_hours?: number;
    screen_before_bed?: boolean;
    
    // Mental health
    mood?: 'very_low' | 'low' | 'neutral' | 'good' | 'great';
    stress_level?: number;
    anxiety_level?: number;
    anger_incidents?: number;
    
    // Mindfulness
    meditation_done?: boolean;
    meditation_minutes?: number;
    
    // Negative habits
    smoking?: boolean;
    junk_food?: boolean;
    
    // Notes
    notes?: string;
}

export interface HabitPattern {
    habit: string;
    frequency: number;
    impact: 'positive' | 'negative';
    severity: 'low' | 'medium' | 'high';
    description: string;
}

export interface Recommendation {
    action: string;
    reason: string;
    priority: 'low' | 'medium' | 'high';
    category: string;
}

export interface PatternAnalysis {
    worstHabits: HabitPattern[];
    bestHabits: HabitPattern[];
    recommendations: Recommendation[];
    summary: string;
    stats: {
        avgMood: number;
        avgStress: number;
        avgEnergy: number;
        avgSleep: number;
        exerciseDays: number;
        meditationDays: number;
    };
}

// ============ HELPER ============

async function getAuthToken(): Promise<string | null> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
}

// ============ HABIT LOGGING ============

/**
 * Log daily habits (creates or updates for today)
 */
export async function logDailyHabits(
    habits: DailyHabit,
    date?: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const token = await getAuthToken();
        if (!token) {
            return { success: false, error: 'Not authenticated' };
        }

        const response = await fetch(`${API_URL}/habits`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
                ...habits,
                date: date || new Date().toISOString().split('T')[0],
            }),
        });

        const result = await response.json();
        return { success: result.success, error: result.error };
    } catch (error) {
        console.error('Error logging habits:', error);
        return { success: false, error: 'Failed to log habits' };
    }
}

/**
 * Quick log a single habit
 */
export async function quickLogHabit(
    habit: string,
    value: any
): Promise<{ success: boolean; error?: string }> {
    try {
        const token = await getAuthToken();
        if (!token) {
            return { success: false, error: 'Not authenticated' };
        }

        const response = await fetch(`${API_URL}/habits/quick`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ habit, value }),
        });

        const result = await response.json();
        return { success: result.success, error: result.error };
    } catch (error) {
        console.error('Error quick logging habit:', error);
        return { success: false, error: 'Failed to log habit' };
    }
}

// ============ HABIT RETRIEVAL ============

/**
 * Get today's habits
 */
export async function getTodayHabits(): Promise<DailyHabit | null> {
    try {
        const token = await getAuthToken();
        if (!token) return null;

        const response = await fetch(`${API_URL}/habits/today`, {
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        const result = await response.json();
        return result.data || null;
    } catch (error) {
        console.error('Error fetching today habits:', error);
        return null;
    }
}

/**
 * Get habits for a specific date
 */
export async function getHabitsForDate(date: string): Promise<DailyHabit | null> {
    try {
        const token = await getAuthToken();
        if (!token) return null;

        const response = await fetch(`${API_URL}/habits/date/${date}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        const result = await response.json();
        return result.data || null;
    } catch (error) {
        console.error('Error fetching habits for date:', error);
        return null;
    }
}

/**
 * Get habit history
 */
export async function getHabitHistory(days: number = 7): Promise<DailyHabit[]> {
    try {
        const token = await getAuthToken();
        if (!token) return [];

        const response = await fetch(`${API_URL}/habits/history?days=${days}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        const result = await response.json();
        return result.data || [];
    } catch (error) {
        console.error('Error fetching habit history:', error);
        return [];
    }
}

// ============ PATTERN ANALYSIS ============

/**
 * Get weekly habit pattern analysis
 */
export async function getHabitPatterns(): Promise<PatternAnalysis | null> {
    try {
        const token = await getAuthToken();
        if (!token) return null;

        const response = await fetch(`${API_URL}/insights/habit-patterns`, {
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        const result = await response.json();
        return result.data || null;
    } catch (error) {
        console.error('Error fetching habit patterns:', error);
        return null;
    }
}

/**
 * Get today's recommendations
 */
export async function getTodayRecommendations(): Promise<Recommendation[]> {
    try {
        const token = await getAuthToken();
        if (!token) return [];

        const response = await fetch(`${API_URL}/insights/recommendations`, {
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        const result = await response.json();
        return result.data || [];
    } catch (error) {
        console.error('Error fetching recommendations:', error);
        return [];
    }
}

/**
 * Get worst habits summary (for Today screen)
 */
export async function getWorstHabitsSummary(): Promise<{
    worstHabits: HabitPattern[];
    topRecommendation: string;
    summary: string;
} | null> {
    try {
        const token = await getAuthToken();
        if (!token) return null;

        const response = await fetch(`${API_URL}/insights/worst-habits`, {
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        const result = await response.json();
        return result.data || null;
    } catch (error) {
        console.error('Error fetching worst habits:', error);
        return null;
    }
}

// ============ CONVENIENCE FUNCTIONS ============

/**
 * Log caffeine intake
 */
export async function logCaffeine(cups: number, isLate: boolean = false) {
    return logDailyHabits({
        caffeine_cups: cups,
        caffeine_late: isLate,
    });
}

/**
 * Log mood
 */
export async function logMood(mood: DailyHabit['mood']) {
    return quickLogHabit('mood', mood);
}

/**
 * Log stress level
 */
export async function logStress(level: number) {
    return quickLogHabit('stress_level', level);
}

/**
 * Log exercise
 */
export async function logExercise(
    done: boolean,
    duration?: number,
    type?: string
) {
    return logDailyHabits({
        exercise_done: done,
        exercise_duration: duration,
        exercise_type: type,
    });
}

/**
 * Log meditation
 */
export async function logMeditation(done: boolean, minutes?: number) {
    return logDailyHabits({
        meditation_done: done,
        meditation_minutes: minutes,
    });
}

/**
 * Log water intake
 */
export async function logWater(glasses: number) {
    return quickLogHabit('water_glasses', glasses);
}

/**
 * Log sleep
 */
export async function logSleep(
    hours: number,
    quality: DailyHabit['sleep_quality']
) {
    return logDailyHabits({
        sleep_hours: hours,
        sleep_quality: quality,
    });
}
