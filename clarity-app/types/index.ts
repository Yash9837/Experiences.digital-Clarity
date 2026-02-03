// User types
export interface User {
    id: string;
    email: string;
    onboarding_completed: boolean;
    notification_preferences: NotificationPreferences;
    created_at: string;
    updated_at: string;
}

export interface NotificationPreferences {
    morning_checkin: boolean;
    midday_pulse: boolean;
    evening_reflection: boolean;
    weekly_insights: boolean;
}

// Check-in types
export type CheckInType = 'morning' | 'midday' | 'evening';

export interface MorningCheckIn {
    rested_score: number; // 1-10
    motivation_level: 'low' | 'medium' | 'high';
}

export interface MiddayCheckIn {
    energy_level: 'low' | 'ok' | 'high';
    state: 'mentally_drained' | 'physically_tired' | 'distracted' | 'fine';
}

export interface EveningCheckIn {
    drain_source: 'poor_sleep' | 'work' | 'physical' | 'emotional' | 'poor_meals' | 'unknown';
    day_vs_expectations: 'better' | 'same' | 'worse';
    // Binary habit flags
    late_caffeine?: boolean;
    skipped_meals?: boolean;
    alcohol?: boolean;
}

export interface CheckIn {
    id: string;
    user_id: string;
    type: CheckInType;
    data: MorningCheckIn | MiddayCheckIn | EveningCheckIn;
    created_at: string;
}

// Energy score types
export interface Action {
    id: string;
    title: string;
    reason?: string;       // AI-generated explanation of why this action helps
    description?: string;
    completed?: boolean;
}

export interface EnergyScore {
    id: string;
    user_id: string;
    score: number; // 1-10 with decimals
    explanation: string;
    actions: Action[];
    date: string;
    created_at: string;
}

// Health data types
export type HealthDataType = 'sleep' | 'steps' | 'calendar';

export interface SleepData {
    duration_hours: number;
    bedtime: string;
    wake_time: string;
    consistency_score?: number;
}

export interface StepsData {
    count: number;
    level: 'low' | 'medium' | 'high';
    sedentary_blocks: number;
}

export interface CalendarData {
    meeting_count: number;
    meeting_density: 'low' | 'medium' | 'high';
    gaps_between_meetings: number;
    late_meetings: boolean;
}

export interface HealthData {
    id: string;
    user_id: string;
    type: HealthDataType;
    data: SleepData | StepsData | CalendarData;
    source_date: string;
    created_at: string;
}

// Feedback types
export interface ExplanationFeedback {
    id: string;
    user_id: string;
    energy_score_id: string;
    matched: boolean;
    created_at: string;
}

// Weekly insights types
export interface WeeklyInsight {
    id: string;
    user_id: string;
    week_start: string;
    top_drains: string[];
    top_supports: string[];
    experiment_suggestion: string;
    created_at: string;
}

// API response types
export interface ApiResponse<T> {
    data?: T;
    error?: string;
    success: boolean;
}
