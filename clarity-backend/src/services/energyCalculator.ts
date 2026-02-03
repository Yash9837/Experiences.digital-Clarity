/**
 * Real-time Energy Score Calculator
 * Calculates and updates energy score whenever check-ins or health data changes
 */

import { supabase } from '../utils/supabase';
import { generateEnergyExplanation, generateSmartActions } from './gemini';

interface CheckIn {
    type: string;
    data: Record<string, unknown>;
    created_at: string;
}

interface HealthData {
    type: string;
    data: Record<string, unknown>;
    source_date: string;
}

interface EnergyResult {
    score: number;
    explanation: string;
    actions: { id: string; title: string; reason?: string }[];
    factors: {
        sleep: number;
        hrv: number;
        activity: number;
        morning: number;
        midday: number;
        evening: number;
        habits: number;
        mentalHealth: number;
        lifestyle: number;
        calendar: number; // Cognitive load from meetings
    };
}

interface DailyHabit {
    caffeine_cups?: number;
    caffeine_late?: boolean;
    sleep_hours?: number;
    sleep_quality?: string;
    alcohol_drinks?: number;
    exercise_done?: boolean;
    exercise_duration?: number;
    meals_count?: number;
    meals_skipped?: string;
    water_glasses?: number;
    screen_time_hours?: number;
    screen_before_bed?: boolean;
    mood?: string;
    stress_level?: number;
    anxiety_level?: number;
    anger_incidents?: number;
    meditation_done?: boolean;
    outdoor_time?: number;
    smoking?: boolean;
    junk_food?: boolean;
    late_night_eating?: boolean;
    work_stress?: string;
}

/**
 * Calculate energy score from check-ins, health data, and daily habits
 * Returns a score from 1-10 with breakdown of contributing factors
 */
export function calculateEnergyScore(
    checkIns: CheckIn[],
    healthData: HealthData[],
    dailyHabit?: DailyHabit | null
): { score: number; factors: EnergyResult['factors'] } {
    let score = 5.0; // Base score

    const factors = {
        sleep: 0,
        hrv: 0,
        activity: 0,
        morning: 0,
        midday: 0,
        evening: 0,
        habits: 0,
        mentalHealth: 0,
        lifestyle: 0,
        calendar: 0,
    };

    // ============ HEALTH DATA FACTORS ============

    // Sleep impact (±1.5)
    const sleepData = healthData.find(h => h.type === 'sleep');
    if (sleepData) {
        const duration = (sleepData.data as { duration_hours?: number }).duration_hours || 0;
        if (duration >= 7.5) factors.sleep = 1.5;
        else if (duration >= 7) factors.sleep = 1.0;
        else if (duration >= 6) factors.sleep = 0.5;
        else if (duration < 5.5) factors.sleep = -1.5;
        else if (duration < 6) factors.sleep = -1.0;
    }

    // HRV impact (±1.0)
    const hrvData = healthData.find(h => h.type === 'hrv');
    if (hrvData) {
        const hrv = (hrvData.data as { value?: number }).value || 0;
        if (hrv >= 60) factors.hrv = 1.0;
        else if (hrv >= 45) factors.hrv = 0.5;
        else if (hrv < 30) factors.hrv = -0.5;
    }

    // Steps/Activity impact (±0.8)
    const stepsData = healthData.find(h => h.type === 'steps');
    if (stepsData) {
        const steps = (stepsData.data as { count?: number }).count || 0;
        if (steps >= 10000) factors.activity = 0.8;
        else if (steps >= 7500) factors.activity = 0.5;
        else if (steps < 3000) factors.activity = -0.5;
    }

    // ============ CALENDAR / COGNITIVE LOAD (±0.5) ============
    const calendarData = healthData.find(h => h.type === 'calendar');
    if (calendarData) {
        const cal = calendarData.data as {
            meetingDensity?: number;
            backToBack?: number;
            meetingHours?: number;
            longestGap?: number;
            lateMeetings?: number;
        };

        // High meeting density drains energy
        if (cal.meetingDensity !== undefined) {
            if (cal.meetingDensity >= 0.6) factors.calendar -= 0.5;
            else if (cal.meetingDensity >= 0.4) factors.calendar -= 0.3;
            else if (cal.meetingDensity <= 0.2) factors.calendar += 0.2;
        }

        // Back-to-back meetings are exhausting
        if (cal.backToBack !== undefined) {
            if (cal.backToBack >= 4) factors.calendar -= 0.3;
            else if (cal.backToBack >= 2) factors.calendar -= 0.1;
        }

        // Late meetings affect recovery
        if (cal.lateMeetings !== undefined && cal.lateMeetings >= 1) {
            factors.calendar -= 0.2;
        }

        // Long breaks are restorative
        if (cal.longestGap !== undefined && cal.longestGap >= 90) {
            factors.calendar += 0.2;
        }

        // Cap calendar impact at ±0.5
        factors.calendar = Math.max(-0.5, Math.min(0.5, factors.calendar));
    }

    // ============ CHECK-IN FACTORS ============

    // Morning check-in (±0.5)
    const morningCheckIn = checkIns.find(c => c.type === 'morning');
    if (morningCheckIn) {
        const data = morningCheckIn.data as {
            rested_score?: number;
            motivation_level?: string;
            sleep_quality?: string;
        };

        // Rested score has significant impact
        if (data.rested_score !== undefined) {
            if (data.rested_score >= 8) factors.morning += 0.5;
            else if (data.rested_score >= 6) factors.morning += 0.2;
            else if (data.rested_score <= 3) factors.morning -= 0.5;
            else if (data.rested_score <= 4) factors.morning -= 0.3;
        }

        // Motivation level
        if (data.motivation_level === 'high') factors.morning += 0.3;
        else if (data.motivation_level === 'low') factors.morning -= 0.3;
    }

    // Midday check-in (±0.5)
    const middayCheckIn = checkIns.find(c => c.type === 'midday');
    if (middayCheckIn) {
        const data = middayCheckIn.data as {
            energy_level?: string;
            state?: string;
            focus_level?: string;
        };

        // Energy level
        if (data.energy_level === 'high') factors.midday += 0.4;
        else if (data.energy_level === 'ok') factors.midday += 0.1;
        else if (data.energy_level === 'low') factors.midday -= 0.4;

        // Mental/physical state
        if (data.state === 'mentally_drained') factors.midday -= 0.2;
        if (data.state === 'physically_tired') factors.midday -= 0.2;
        if (data.state === 'feeling_great') factors.midday += 0.2;
    }

    // Evening check-in (±0.5)
    const eveningCheckIn = checkIns.find(c => c.type === 'evening');
    if (eveningCheckIn) {
        const data = eveningCheckIn.data as {
            day_vs_expectations?: string;
            drain_source?: string;
            late_caffeine?: boolean;
            skipped_meals?: boolean;
            alcohol?: boolean;
            screen_time_before_bed?: boolean;
        };

        // Day vs expectations
        if (data.day_vs_expectations === 'better') factors.evening += 0.3;
        else if (data.day_vs_expectations === 'worse') factors.evening -= 0.3;

        // Drain source impact
        if (data.drain_source === 'work_stress') factors.evening -= 0.2;
        if (data.drain_source === 'poor_sleep') factors.evening -= 0.2;

        // Habit penalties (accumulate in habits factor)
        if (data.late_caffeine) factors.habits -= 0.2;
        if (data.skipped_meals) factors.habits -= 0.3;
        if (data.alcohol) factors.habits -= 0.2;
        if (data.screen_time_before_bed) factors.habits -= 0.1;
    }

    // ============ DAILY HABITS FACTORS ============

    if (dailyHabit) {
        // Caffeine impact (±0.3)
        if (dailyHabit.caffeine_late) factors.habits -= 0.2;
        if ((dailyHabit.caffeine_cups || 0) > 4) factors.habits -= 0.2;

        // Sleep from habits (supplements health data)
        if (dailyHabit.sleep_quality === 'excellent') factors.sleep += 0.2;
        else if (dailyHabit.sleep_quality === 'poor') factors.sleep -= 0.3;

        // Alcohol impact (±0.3)
        if ((dailyHabit.alcohol_drinks || 0) >= 3) factors.habits -= 0.3;
        else if ((dailyHabit.alcohol_drinks || 0) >= 1) factors.habits -= 0.1;

        // Exercise boost (±0.5)
        if (dailyHabit.exercise_done) {
            factors.activity += 0.3;
            if ((dailyHabit.exercise_duration || 0) >= 30) factors.activity += 0.2;
        }

        // Meals & hydration (±0.3)
        if (dailyHabit.meals_skipped) factors.habits -= 0.2;
        if ((dailyHabit.water_glasses || 0) >= 8) factors.lifestyle += 0.2;
        else if ((dailyHabit.water_glasses || 0) < 4) factors.lifestyle -= 0.2;

        // Screen time impact (±0.2)
        if (dailyHabit.screen_before_bed) factors.habits -= 0.2;
        if ((dailyHabit.screen_time_hours || 0) > 8) factors.lifestyle -= 0.1;

        // Mental health factors (±0.5)
        const moodImpact: Record<string, number> = {
            'great': 0.4,
            'good': 0.2,
            'neutral': 0,
            'low': -0.3,
            'very_low': -0.5,
        };
        factors.mentalHealth += moodImpact[dailyHabit.mood || 'neutral'] || 0;

        // Stress impact (±0.4)
        if (dailyHabit.stress_level !== undefined) {
            if (dailyHabit.stress_level >= 8) factors.mentalHealth -= 0.4;
            else if (dailyHabit.stress_level >= 6) factors.mentalHealth -= 0.2;
            else if (dailyHabit.stress_level <= 3) factors.mentalHealth += 0.2;
        }

        // Anxiety impact (±0.3)
        if (dailyHabit.anxiety_level !== undefined) {
            if (dailyHabit.anxiety_level >= 7) factors.mentalHealth -= 0.3;
            else if (dailyHabit.anxiety_level <= 3) factors.mentalHealth += 0.1;
        }

        // Anger/irritation impact (±0.2)
        if ((dailyHabit.anger_incidents || 0) >= 2) factors.mentalHealth -= 0.2;

        // Mindfulness boost (±0.3)
        if (dailyHabit.meditation_done) factors.mentalHealth += 0.3;

        // Outdoor time boost (±0.2)
        if ((dailyHabit.outdoor_time || 0) >= 30) factors.lifestyle += 0.2;

        // Negative habit penalties
        if (dailyHabit.smoking) factors.habits -= 0.3;
        if (dailyHabit.junk_food) factors.habits -= 0.1;
        if (dailyHabit.late_night_eating) factors.habits -= 0.1;

        // Work stress (±0.2)
        if (dailyHabit.work_stress === 'extreme') factors.mentalHealth -= 0.3;
        else if (dailyHabit.work_stress === 'high') factors.mentalHealth -= 0.1;
    }

    // ============ CALCULATE FINAL SCORE ============

    score += factors.sleep + factors.hrv + factors.activity;
    score += factors.morning + factors.midday + factors.evening;
    score += factors.habits + factors.mentalHealth + factors.lifestyle;

    // Clamp to 1-10 range
    score = Math.max(1, Math.min(10, score));

    // Round to 1 decimal place
    score = Math.round(score * 10) / 10;

    return { score, factors };
}

/**
 * Generate explanation context from check-ins and health data
 */
function buildContext(
    checkIns: CheckIn[],
    healthData: HealthData[],
    factors: EnergyResult['factors'],
    dailyHabit?: DailyHabit | null
): string {
    const parts: string[] = [];

    const morningCheckIn = checkIns.find(c => c.type === 'morning');
    if (morningCheckIn) {
        const data = morningCheckIn.data as { rested_score?: number; motivation_level?: string };
        parts.push(`Morning: Rested ${data.rested_score}/10, motivation ${data.motivation_level}`);
    }

    const middayCheckIn = checkIns.find(c => c.type === 'midday');
    if (middayCheckIn) {
        const data = middayCheckIn.data as { energy_level?: string; state?: string };
        parts.push(`Mid-day: Energy ${data.energy_level}, feeling ${data.state?.replace('_', ' ')}`);
    }

    const eveningCheckIn = checkIns.find(c => c.type === 'evening');
    if (eveningCheckIn) {
        const data = eveningCheckIn.data as {
            drain_source?: string;
            day_vs_expectations?: string;
            late_caffeine?: boolean;
            skipped_meals?: boolean;
            alcohol?: boolean;
        };
        parts.push(`Evening: Day was ${data.day_vs_expectations} than expected`);

        const habits: string[] = [];
        if (data.late_caffeine) habits.push('late caffeine');
        if (data.skipped_meals) habits.push('skipped meals');
        if (data.alcohol) habits.push('alcohol');
        if (habits.length > 0) {
            parts.push(`Habits affecting energy: ${habits.join(', ')}`);
        }
    }

    // Add health data context
    const sleepData = healthData.find(h => h.type === 'sleep');
    if (sleepData) {
        const duration = (sleepData.data as { duration_hours?: number }).duration_hours;
        if (duration) parts.push(`Sleep: ${duration.toFixed(1)} hours`);
    }

    const hrvData = healthData.find(h => h.type === 'hrv');
    if (hrvData) {
        const hrv = (hrvData.data as { value?: number }).value;
        if (hrv) parts.push(`HRV: ${hrv}ms`);
    }

    const stepsData = healthData.find(h => h.type === 'steps');
    if (stepsData) {
        const steps = (stepsData.data as { count?: number }).count;
        if (steps) parts.push(`Steps: ${steps.toLocaleString()}`);
    }

    // Add calendar/meeting data context
    const calendarData = healthData.find(h => h.type === 'calendar');
    if (calendarData) {
        const cal = calendarData.data as {
            meetingCount?: number;
            meetingHours?: number;
            meetingDensity?: number;
            backToBack?: number;
            lateMeetings?: number;
            longestGap?: number;
        };
        
        const calendarParts: string[] = [];
        if (cal.meetingCount !== undefined) {
            calendarParts.push(`${cal.meetingCount} meetings`);
        }
        if (cal.meetingHours !== undefined) {
            calendarParts.push(`${cal.meetingHours.toFixed(1)} hrs in meetings`);
        }
        if (cal.backToBack !== undefined && cal.backToBack > 0) {
            calendarParts.push(`${cal.backToBack} back-to-back`);
        }
        if (cal.lateMeetings !== undefined && cal.lateMeetings > 0) {
            calendarParts.push(`${cal.lateMeetings} late meetings`);
        }
        if (cal.meetingDensity !== undefined) {
            const densityPercent = Math.round(cal.meetingDensity * 100);
            if (densityPercent >= 60) {
                calendarParts.push('heavy meeting day');
            } else if (densityPercent >= 40) {
                calendarParts.push('moderate meeting load');
            } else if (densityPercent > 0) {
                calendarParts.push('light meeting load');
            }
        }
        if (calendarParts.length > 0) {
            parts.push(`Calendar: ${calendarParts.join(', ')}`);
        }
    }

    // Add daily habits context
    if (dailyHabit) {
        const habitInfo: string[] = [];

        if (dailyHabit.mood) habitInfo.push(`Mood: ${dailyHabit.mood.replace('_', ' ')}`);
        if (dailyHabit.stress_level) habitInfo.push(`Stress: ${dailyHabit.stress_level}/10`);
        if (dailyHabit.exercise_done) habitInfo.push(`Exercised: ${dailyHabit.exercise_duration || 0} min`);
        if (dailyHabit.meditation_done) habitInfo.push('Meditated ✓');
        if ((dailyHabit.caffeine_cups || 0) > 0) habitInfo.push(`Caffeine: ${dailyHabit.caffeine_cups} cups`);
        if ((dailyHabit.alcohol_drinks || 0) > 0) habitInfo.push(`Alcohol: ${dailyHabit.alcohol_drinks} drinks`);
        if ((dailyHabit.water_glasses || 0) > 0) habitInfo.push(`Water: ${dailyHabit.water_glasses} glasses`);

        if (habitInfo.length > 0) {
            parts.push(`Habits: ${habitInfo.join(', ')}`);
        }
    }

    // Add factor summary
    const positiveFactors: string[] = [];
    const negativeFactors: string[] = [];

    if (factors.sleep > 0) positiveFactors.push('good sleep');
    if (factors.sleep < 0) negativeFactors.push('poor sleep');
    if (factors.hrv > 0) positiveFactors.push('good HRV/recovery');
    if (factors.hrv < 0) negativeFactors.push('low HRV');
    if (factors.activity > 0) positiveFactors.push('active day');
    if (factors.activity < 0) negativeFactors.push('low activity');
    if (factors.morning > 0) positiveFactors.push('felt rested');
    if (factors.morning < 0) negativeFactors.push('felt tired');
    if (factors.midday > 0) positiveFactors.push('strong afternoon');
    if (factors.midday < 0) negativeFactors.push('afternoon slump');
    if (factors.habits < 0) negativeFactors.push('habit impacts');
    if (factors.mentalHealth > 0) positiveFactors.push('positive mood');
    if (factors.mentalHealth < 0) negativeFactors.push('mental strain');
    if (factors.lifestyle > 0) positiveFactors.push('healthy lifestyle');
    if (factors.lifestyle < 0) negativeFactors.push('lifestyle factors');
    if (factors.calendar > 0) positiveFactors.push('light meeting day');
    if (factors.calendar < 0) negativeFactors.push('heavy meeting load');

    if (positiveFactors.length > 0) {
        parts.push(`Positive: ${positiveFactors.join(', ')}`);
    }
    if (negativeFactors.length > 0) {
        parts.push(`Challenges: ${negativeFactors.join(', ')}`);
    }

    return parts.join('\n');
}

/**
 * Generate a simple explanation without LLM (fallback)
 */
function generateSimpleExplanation(score: number, factors: EnergyResult['factors']): string {
    const positiveFactors: string[] = [];
    const negativeFactors: string[] = [];

    if (factors.sleep > 0.5) positiveFactors.push('solid sleep');
    if (factors.sleep < -0.5) negativeFactors.push('short sleep');
    if (factors.hrv > 0) positiveFactors.push('good recovery');
    if (factors.hrv < 0) negativeFactors.push('body needs rest');
    if (factors.activity > 0) positiveFactors.push('staying active');
    if (factors.activity < 0) negativeFactors.push('low movement');
    if (factors.morning > 0) positiveFactors.push('woke up refreshed');
    if (factors.morning < -0.3) negativeFactors.push('rough morning');
    if (factors.midday > 0) positiveFactors.push('strong afternoon');
    if (factors.midday < -0.2) negativeFactors.push('afternoon dip');
    if (factors.habits < -0.3) negativeFactors.push('some habits to watch');
    if (factors.mentalHealth > 0) positiveFactors.push('positive mindset');
    if (factors.mentalHealth < -0.2) negativeFactors.push('stress/anxiety');
    if (factors.lifestyle > 0) positiveFactors.push('good self-care');
    if (factors.lifestyle < 0) negativeFactors.push('lifestyle tweaks needed');

    if (score >= 7) {
        const highlights = positiveFactors.slice(0, 2).join(' and ');
        return `You're doing great today! ${highlights ? `Your ${highlights} really helped.` : ''} Keep this momentum going! 💪`;
    } else if (score >= 5) {
        const good = positiveFactors[0] || 'steady pace';
        const watchOut = negativeFactors[0] || '';
        return `Decent energy today. ${good.charAt(0).toUpperCase() + good.slice(1)} is working for you. ${watchOut ? `Maybe watch the ${watchOut}.` : 'Keep listening to your body.'}`;
    } else {
        const issues = negativeFactors.slice(0, 2).join(' and ');
        return `Energy is lower today. ${issues ? `The ${issues} might be factors.` : ''} Be gentle with yourself and prioritize rest. 🌙`;
    }
}

/**
 * Main function: Recalculate and update energy score for a user on a specific date
 * Called whenever check-ins are created/updated
 * @param checkInHash - Optional hash of check-ins to save for cache validation
 */
export async function recalculateEnergyScore(
    userId: string,
    date?: string,
    checkInHash?: string
): Promise<EnergyResult | null> {
    try {
        const targetDate = date || new Date().toISOString().split('T')[0];

        // Get today's check-ins
        const startOfDay = new Date(targetDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);

        const { data: checkIns, error: checkInError } = await supabase
            .from('check_ins')
            .select('*')
            .eq('user_id', userId)
            .gte('created_at', startOfDay.toISOString())
            .lte('created_at', endOfDay.toISOString());

        if (checkInError) throw checkInError;

        // Need at least one check-in to calculate
        if (!checkIns || checkIns.length === 0) {
            return null;
        }

        // Get health data for the day
        const { data: healthData } = await supabase
            .from('health_data')
            .select('*')
            .eq('user_id', userId)
            .eq('source_date', targetDate);

        // Get daily habits for the day
        const { data: dailyHabit } = await supabase
            .from('daily_habits')
            .select('*')
            .eq('user_id', userId)
            .eq('date', targetDate)
            .single();

        // Calculate score with all data sources
        const { score, factors } = calculateEnergyScore(checkIns, healthData || [], dailyHabit);

        // Build context for explanation
        const context = buildContext(checkIns, healthData || [], factors, dailyHabit);

        // Try to generate LLM explanation, fallback to simple
        let explanation: string;
        let actions: { id: string; title: string }[] = [];

        try {
            explanation = await generateEnergyExplanation(score, context);
            actions = await generateSmartActions(score, context);
        } catch (llmError) {
            console.log('LLM unavailable, using simple explanation');
            explanation = generateSimpleExplanation(score, factors);
            actions = generateDefaultActions(score, factors);
        }

        // Upsert energy score (update if exists, insert if not)
        const { data: existingScore } = await supabase
            .from('energy_scores')
            .select('id')
            .eq('user_id', userId)
            .eq('date', targetDate)
            .single();

        let savedScore;
        if (existingScore) {
            // Update existing score
            const { data, error } = await supabase
                .from('energy_scores')
                .update({
                    score,
                    explanation,
                    actions,
                    health_factors: factors,
                    check_in_hash: checkInHash || null,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', existingScore.id)
                .select()
                .single();

            if (error) throw error;
            savedScore = data;
        } else {
            // Insert new score
            const { data, error } = await supabase
                .from('energy_scores')
                .insert({
                    user_id: userId,
                    score,
                    explanation,
                    actions,
                    health_factors: factors,
                    check_in_hash: checkInHash || null,
                    date: targetDate,
                })
                .select()
                .single();

            if (error) throw error;
            savedScore = data;
        }

        console.log(`⚡ Energy score updated for ${userId}: ${score}/10`);

        return {
            score,
            explanation,
            actions,
            factors,
        };
    } catch (error) {
        console.error('Error recalculating energy score:', error);
        return null;
    }
}

/**
 * Generate default actions based on score and factors - always returns 3 actions
 */
function generateDefaultActions(score: number, factors: EnergyResult['factors']): { id: string; title: string; reason: string }[] {
    const actions: { id: string; title: string; reason: string }[] = [];

    if (score < 4) {
        // Low energy actions
        actions.push(
            { id: '1', title: 'Take 5 deep breaths now', reason: 'Resets your nervous system' },
            { id: '2', title: 'Drink a glass of water', reason: 'Dehydration causes fatigue' },
            { id: '3', title: 'Step outside for 2 minutes', reason: 'Fresh air boosts alertness' }
        );
    } else if (score < 7) {
        // Medium energy actions
        if (factors.sleep < 0) {
            actions.push({ id: '1', title: 'Plan to sleep 30 min earlier', reason: 'Your sleep needs a boost' });
        } else {
            actions.push({ id: '1', title: 'Do a quick stretch', reason: 'Releases physical tension' });
        }
        if (factors.activity < 0) {
            actions.push({ id: '2', title: 'Take a 10-minute walk', reason: 'Movement boosts energy' });
        } else {
            actions.push({ id: '2', title: 'Listen to an uplifting song', reason: 'Music elevates mood fast' });
        }
        if (factors.mentalHealth < 0) {
            actions.push({ id: '3', title: 'Breathe deeply for 1 minute', reason: 'Calms stress response' });
        } else {
            actions.push({ id: '3', title: 'Take a proper break', reason: 'Rest maintains energy' });
        }
    } else {
        // High energy actions
        actions.push(
            { id: '1', title: 'Tackle your top priority now', reason: 'Ride the momentum!' },
            { id: '2', title: 'Help someone out today', reason: 'Boosts your mood even more' },
            { id: '3', title: 'Plan something fun for later', reason: 'Keep the positivity flowing' }
        );
    }

    return actions.slice(0, 3);
}
