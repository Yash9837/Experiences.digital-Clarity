/**
 * Pattern Recognition Service
 * Analyzes weekly habits to identify patterns, worst habits, and generate recommendations
 */

import { supabase } from '../utils/supabase';
import { generateWeeklySummary } from './gemini';

interface DailyHabit {
    date: string;
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

interface HabitPattern {
    habit: string;
    frequency: number;       // How many days (out of 7)
    impact: 'positive' | 'negative';
    severity: 'low' | 'medium' | 'high';
    description: string;
    icon: string;            // Emoji icon for display
}

interface Correlation {
    trigger: string;
    effect: string;
    strength: number;        // 0-1 correlation strength
    direction: 'positive' | 'negative';
    description: string;
}

interface Recommendation {
    action: string;
    reason: string;
    priority: 'low' | 'medium' | 'high';
    category: string;
    timeOfDay?: string;
    icon: string;            // Emoji icon for display
    duration?: string;       // Suggested duration
}

export interface PatternAnalysis {
    worstHabits: HabitPattern[];
    bestHabits: HabitPattern[];
    correlations: Correlation[];
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

/**
 * Analyze weekly habits and identify patterns
 */
export async function analyzeWeeklyPatterns(userId: string): Promise<PatternAnalysis> {
    // Get last 7 days of habits
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    const { data: habits } = await supabase
        .from('daily_habits')
        .select('*')
        .eq('user_id', userId)
        .gte('date', startDate.toISOString().split('T')[0])
        .order('date', { ascending: true });

    // Get energy scores for the same period
    const { data: energyScores } = await supabase
        .from('energy_scores')
        .select('score, date')
        .eq('user_id', userId)
        .gte('date', startDate.toISOString().split('T')[0]);

    if (!habits || habits.length < 3) {
        return getDefaultAnalysis('Need at least 3 days of data for pattern analysis. Keep tracking!');
    }

    // Identify worst habits
    const worstHabits = identifyWorstHabits(habits);
    
    // Identify best habits
    const bestHabits = identifyBestHabits(habits);
    
    // Find correlations between habits and mood/energy
    const correlations = findCorrelations(habits, energyScores || []);
    
    // Generate recommendations based on patterns
    const recommendations = generateRecommendations(worstHabits, correlations, habits);
    
    // Calculate stats
    const stats = calculateStats(habits, energyScores || []);
    
    // Generate AI summary
    let summary: string;
    try {
        summary = await generatePatternSummary(worstHabits, bestHabits, stats);
    } catch (error) {
        summary = generateFallbackSummary(worstHabits, bestHabits, stats);
    }

    // Save pattern analysis
    await savePatternAnalysis(userId, startDate, endDate, {
        worstHabits,
        bestHabits,
        correlations,
        recommendations,
        summary,
        stats,
    });

    return {
        worstHabits,
        bestHabits,
        correlations,
        recommendations,
        summary,
        stats,
    };
}

/**
 * Identify worst habits from weekly data
 */
function identifyWorstHabits(habits: DailyHabit[]): HabitPattern[] {
    const patterns: HabitPattern[] = [];
    const days = habits.length;

    // Late caffeine
    const lateCaffeineDays = habits.filter(h => h.caffeine_late).length;
    if (lateCaffeineDays >= 3) {
        patterns.push({
            habit: 'Late Caffeine',
            frequency: lateCaffeineDays / days,
            impact: 'negative',
            severity: lateCaffeineDays >= 5 ? 'high' : 'medium',
            description: `Had caffeine after 2pm on ${lateCaffeineDays} of ${days} days`,
            icon: '☕',
        });
    }

    // Excessive caffeine
    const avgCaffeine = habits.reduce((sum, h) => sum + (h.caffeine_cups || 0), 0) / days;
    if (avgCaffeine > 3) {
        patterns.push({
            habit: 'High Caffeine Intake',
            frequency: 1,
            impact: 'negative',
            severity: avgCaffeine > 5 ? 'high' : 'medium',
            description: `Averaging ${avgCaffeine.toFixed(1)} cups/day`,
            icon: '☕',
        });
    }

    // Poor sleep
    const poorSleepDays = habits.filter(h => 
        h.sleep_hours && h.sleep_hours < 6
    ).length;
    if (poorSleepDays >= 2) {
        patterns.push({
            habit: 'Insufficient Sleep',
            frequency: poorSleepDays / days,
            impact: 'negative',
            severity: poorSleepDays >= 4 ? 'high' : 'medium',
            description: `Got less than 6 hours on ${poorSleepDays} days`,
            icon: '😴',
        });
    }

    // Alcohol consumption
    const drinkingDays = habits.filter(h => (h.alcohol_drinks || 0) > 0).length;
    const totalDrinks = habits.reduce((sum, h) => sum + (h.alcohol_drinks || 0), 0);
    if (totalDrinks > 7 || drinkingDays >= 4) {
        patterns.push({
            habit: 'Alcohol Consumption',
            frequency: drinkingDays / days,
            impact: 'negative',
            severity: totalDrinks > 14 ? 'high' : 'medium',
            description: `${totalDrinks} drinks across ${drinkingDays} days`,
            icon: '🍷',
        });
    }

    // No exercise
    const noExerciseDays = habits.filter(h => !h.exercise_done).length;
    if (noExerciseDays >= 5) {
        patterns.push({
            habit: 'Lack of Exercise',
            frequency: noExerciseDays / days,
            impact: 'negative',
            severity: noExerciseDays === 7 ? 'high' : 'medium',
            description: `No exercise on ${noExerciseDays} of ${days} days`,
            icon: '🏃',
        });
    }

    // Screen before bed
    const screenBeforeBedDays = habits.filter(h => h.screen_before_bed).length;
    if (screenBeforeBedDays >= 4) {
        patterns.push({
            habit: 'Screen Before Bed',
            frequency: screenBeforeBedDays / days,
            impact: 'negative',
            severity: screenBeforeBedDays >= 6 ? 'high' : 'medium',
            description: `Used screens before sleep on ${screenBeforeBedDays} days`,
            icon: '📱',
        });
    }

    // High stress
    const highStressDays = habits.filter(h => 
        h.stress_level && h.stress_level >= 7
    ).length;
    if (highStressDays >= 3) {
        patterns.push({
            habit: 'High Stress Levels',
            frequency: highStressDays / days,
            impact: 'negative',
            severity: highStressDays >= 5 ? 'high' : 'medium',
            description: `Stress level ≥7 on ${highStressDays} days`,
            icon: '😰',
        });
    }

    // Skipped meals
    const skippedMealsDays = habits.filter(h => h.meals_skipped).length;
    if (skippedMealsDays >= 3) {
        patterns.push({
            habit: 'Skipping Meals',
            frequency: skippedMealsDays / days,
            impact: 'negative',
            severity: 'medium',
            description: `Skipped meals on ${skippedMealsDays} days`,
            icon: '🍽️',
        });
    }

    // Low water intake
    const lowWaterDays = habits.filter(h => 
        h.water_glasses !== undefined && h.water_glasses < 4
    ).length;
    if (lowWaterDays >= 4) {
        patterns.push({
            habit: 'Low Hydration',
            frequency: lowWaterDays / days,
            impact: 'negative',
            severity: 'medium',
            description: `Less than 4 glasses of water on ${lowWaterDays} days`,
            icon: '💧',
        });
    }

    // Anger/irritation
    const angerDays = habits.filter(h => (h.anger_incidents || 0) > 0).length;
    if (angerDays >= 3) {
        patterns.push({
            habit: 'Frequent Irritation',
            frequency: angerDays / days,
            impact: 'negative',
            severity: angerDays >= 5 ? 'high' : 'medium',
            description: `Felt angry/irritated on ${angerDays} days`,
            icon: '😤',
        });
    }

    // Smoking
    const smokingDays = habits.filter(h => h.smoking).length;
    if (smokingDays > 0) {
        patterns.push({
            habit: 'Smoking',
            frequency: smokingDays / days,
            impact: 'negative',
            severity: 'high',
            description: `Smoked on ${smokingDays} days`,
            icon: '🚬',
        });
    }

    // Junk food
    const junkFoodDays = habits.filter(h => h.junk_food).length;
    if (junkFoodDays >= 3) {
        patterns.push({
            habit: 'Junk Food',
            frequency: junkFoodDays / days,
            impact: 'negative',
            severity: junkFoodDays >= 5 ? 'high' : 'medium',
            description: `Ate junk food on ${junkFoodDays} days`,
            icon: '🍔',
        });
    }

    // Sort by severity and frequency
    return patterns.sort((a, b) => {
        const severityOrder = { high: 3, medium: 2, low: 1 };
        return severityOrder[b.severity] - severityOrder[a.severity] || b.frequency - a.frequency;
    }).slice(0, 5); // Top 5 worst habits
}

/**
 * Identify best habits
 */
function identifyBestHabits(habits: DailyHabit[]): HabitPattern[] {
    const patterns: HabitPattern[] = [];
    const days = habits.length;

    // Regular exercise
    const exerciseDays = habits.filter(h => h.exercise_done).length;
    if (exerciseDays >= 3) {
        patterns.push({
            habit: 'Regular Exercise',
            frequency: exerciseDays / days,
            impact: 'positive',
            severity: exerciseDays >= 5 ? 'high' : 'medium',
            description: `Exercised on ${exerciseDays} of ${days} days`,
            icon: '🏃',
        });
    }

    // Good sleep
    const goodSleepDays = habits.filter(h => 
        h.sleep_hours && h.sleep_hours >= 7 && h.sleep_hours <= 9
    ).length;
    if (goodSleepDays >= 4) {
        patterns.push({
            habit: 'Good Sleep Duration',
            frequency: goodSleepDays / days,
            impact: 'positive',
            severity: goodSleepDays >= 6 ? 'high' : 'medium',
            description: `Got 7-9 hours on ${goodSleepDays} days`,
            icon: '😴',
        });
    }

    // Meditation
    const meditationDays = habits.filter(h => h.meditation_done).length;
    if (meditationDays >= 2) {
        patterns.push({
            habit: 'Meditation Practice',
            frequency: meditationDays / days,
            impact: 'positive',
            severity: meditationDays >= 5 ? 'high' : 'medium',
            description: `Meditated on ${meditationDays} days`,
            icon: '🧘',
        });
    }

    // Good hydration
    const hydratedDays = habits.filter(h => 
        h.water_glasses && h.water_glasses >= 8
    ).length;
    if (hydratedDays >= 3) {
        patterns.push({
            habit: 'Good Hydration',
            frequency: hydratedDays / days,
            impact: 'positive',
            severity: hydratedDays >= 5 ? 'high' : 'medium',
            description: `Drank 8+ glasses on ${hydratedDays} days`,
            icon: '💧',
        });
    }

    // Outdoor time
    const outdoorDays = habits.filter(h => 
        h.outdoor_time && h.outdoor_time >= 30
    ).length;
    if (outdoorDays >= 3) {
        patterns.push({
            habit: 'Outdoor Time',
            frequency: outdoorDays / days,
            impact: 'positive',
            severity: 'medium',
            description: `Spent 30+ min outdoors on ${outdoorDays} days`,
            icon: '🌳',
        });
    }

    // Low stress days
    const lowStressDays = habits.filter(h => 
        h.stress_level && h.stress_level <= 3
    ).length;
    if (lowStressDays >= 3) {
        patterns.push({
            habit: 'Stress Management',
            frequency: lowStressDays / days,
            impact: 'positive',
            severity: 'medium',
            description: `Maintained low stress on ${lowStressDays} days`,
            icon: '😌',
        });
    }

    return patterns.sort((a, b) => b.frequency - a.frequency).slice(0, 5);
}

/**
 * Find correlations between habits and outcomes
 */
function findCorrelations(habits: DailyHabit[], energyScores: { score: number; date: string }[]): Correlation[] {
    const correlations: Correlation[] = [];
    
    // Create date-indexed energy scores
    const energyByDate = new Map(energyScores.map(e => [e.date, e.score]));
    
    // Match habits with energy scores
    const matched = habits.filter(h => energyByDate.has(h.date)).map(h => ({
        ...h,
        energy: energyByDate.get(h.date)!,
    }));

    if (matched.length < 3) return correlations;

    // Check late caffeine → poor energy next day
    const lateCaffeineEffect = checkNextDayEffect(matched, 'caffeine_late', true);
    if (lateCaffeineEffect.correlation > 0.3) {
        correlations.push({
            trigger: 'Late Caffeine',
            effect: 'Lower energy next day',
            strength: lateCaffeineEffect.correlation,
            direction: 'negative',
            description: `Late caffeine correlates with ${(lateCaffeineEffect.avgDrop * 10).toFixed(0)}% lower energy`,
        });
    }

    // Check exercise → mood
    const exerciseEffect = checkSameDayEffect(matched, 'exercise_done', true, 'mood');
    if (exerciseEffect.correlation > 0.3) {
        correlations.push({
            trigger: 'Exercise',
            effect: 'Better mood',
            strength: exerciseEffect.correlation,
            direction: 'positive',
            description: 'Exercise days show improved mood',
        });
    }

    // Check poor sleep → stress
    const poorSleepEffect = checkSameDayEffect(
        matched.map(m => ({ ...m, poor_sleep: (m.sleep_hours || 7) < 6 })),
        'poor_sleep',
        true,
        'stress_level'
    );
    if (poorSleepEffect.correlation > 0.3) {
        correlations.push({
            trigger: 'Poor Sleep',
            effect: 'Higher stress',
            strength: poorSleepEffect.correlation,
            direction: 'negative',
            description: 'Sleep < 6 hours correlates with higher stress',
        });
    }

    // Check meditation → anxiety
    const meditationEffect = checkSameDayEffect(matched, 'meditation_done', true, 'anxiety_level');
    if (meditationEffect.correlation > 0.2) {
        correlations.push({
            trigger: 'Meditation',
            effect: 'Lower anxiety',
            strength: meditationEffect.correlation,
            direction: 'positive',
            description: 'Meditation days show reduced anxiety',
        });
    }

    return correlations.sort((a, b) => b.strength - a.strength).slice(0, 4);
}

/**
 * Generate recommendations based on patterns
 */
function generateRecommendations(
    worstHabits: HabitPattern[],
    correlations: Correlation[],
    habits: DailyHabit[]
): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // Recommendations based on worst habits
    worstHabits.forEach(habit => {
        switch (habit.habit) {
            case 'Late Caffeine':
                recommendations.push({
                    action: 'Switch to decaf after 2pm',
                    reason: 'Late caffeine disrupts sleep quality',
                    priority: habit.severity === 'high' ? 'high' : 'medium',
                    category: 'caffeine',
                    timeOfDay: 'afternoon',
                    icon: '☕',
                    duration: undefined,
                });
                break;

            case 'Insufficient Sleep':
                recommendations.push({
                    action: 'Set a bedtime alarm 30 minutes earlier',
                    reason: 'You averaged less than 6 hours several days',
                    priority: 'high',
                    category: 'sleep',
                    timeOfDay: 'evening',
                    icon: '🛏️',
                    duration: undefined,
                });
                break;

            case 'Lack of Exercise':
                recommendations.push({
                    action: 'Take a 15-minute walk today',
                    reason: 'Movement boosts energy and mood',
                    priority: 'medium',
                    category: 'exercise',
                    timeOfDay: 'morning',
                    icon: '🚶',
                    duration: '15 minutes',
                });
                break;

            case 'Screen Before Bed':
                recommendations.push({
                    action: 'Put phone away 1 hour before bed',
                    reason: 'Blue light affects sleep quality',
                    priority: habit.severity === 'high' ? 'high' : 'medium',
                    category: 'screen',
                    timeOfDay: 'evening',
                    icon: '📵',
                    duration: undefined,
                });
                break;

            case 'High Stress Levels':
                recommendations.push({
                    action: 'Try 5 minutes of deep breathing',
                    reason: 'Your stress levels were elevated this week',
                    priority: 'high',
                    category: 'mindfulness',
                    icon: '🧘',
                    duration: '5 minutes',
                });
                recommendations.push({
                    action: 'Take a nature walk',
                    reason: 'Nature exposure reduces cortisol',
                    priority: 'medium',
                    category: 'outdoor',
                    icon: '🌳',
                    duration: '20 minutes',
                });
                break;

            case 'Frequent Irritation':
                recommendations.push({
                    action: 'Practice 2-minute meditation when frustrated',
                    reason: 'You felt irritated on multiple days',
                    priority: 'medium',
                    category: 'mindfulness',
                    icon: '🧘',
                    duration: '2 minutes',
                });
                break;

            case 'Low Hydration':
                recommendations.push({
                    action: 'Keep a water bottle at your desk',
                    reason: 'Dehydration affects focus and energy',
                    priority: 'medium',
                    category: 'nutrition',
                    icon: '💧',
                    duration: undefined,
                });
                break;

            case 'Skipping Meals':
                recommendations.push({
                    action: 'Prep healthy snacks for busy days',
                    reason: 'Skipped meals cause energy crashes',
                    priority: 'medium',
                    category: 'nutrition',
                    icon: '🥗',
                    duration: undefined,
                });
                break;

            case 'Junk Food':
                recommendations.push({
                    action: 'Swap one junk meal for a healthier option',
                    reason: 'Better nutrition = better energy',
                    priority: 'low',
                    category: 'nutrition',
                    icon: '🥗',
                    duration: undefined,
                });
                break;

            case 'Alcohol Consumption':
                recommendations.push({
                    action: 'Try an alcohol-free day today',
                    reason: 'Alcohol affects sleep quality and recovery',
                    priority: 'medium',
                    category: 'alcohol',
                    icon: '🚫🍺',
                    duration: undefined,
                });
                break;

            case 'Smoking':
                recommendations.push({
                    action: 'When urge hits, take 5 deep breaths instead',
                    reason: 'Small steps toward reducing smoking',
                    priority: 'high',
                    category: 'smoking',
                    icon: '🌬️',
                    duration: '1 minute',
                });
                break;
        }
    });

    // Add general wellness recommendations if needed
    const hasMeditation = recommendations.some(r => r.category === 'mindfulness');
    const hasExercise = recommendations.some(r => r.category === 'exercise');
    
    if (!hasMeditation) {
        recommendations.push({
            action: 'Start with 5 minutes of morning meditation',
            reason: 'Builds mental resilience over time',
            priority: 'low',
            category: 'mindfulness',
            timeOfDay: 'morning',
            icon: '🧘',
            duration: '5 minutes',
        });
    }

    if (!hasExercise && worstHabits.some(h => h.habit === 'High Stress Levels')) {
        recommendations.push({
            action: 'Do 10 jumping jacks to release tension',
            reason: 'Physical movement releases stress',
            priority: 'medium',
            category: 'exercise',
            icon: '🏃',
            duration: '2 minutes',
        });
    }

    // Sort by priority
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    return recommendations
        .sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority])
        .slice(0, 5);
}

/**
 * Calculate stats from habits and energy
 */
function calculateStats(habits: DailyHabit[], energyScores: { score: number; date: string }[]) {
    const moodMap: Record<string, number> = {
        'very_low': 1, 'low': 2, 'neutral': 3, 'good': 4, 'great': 5
    };

    return {
        avgMood: average(habits.map(h => moodMap[h.mood || 'neutral'] || 3)),
        avgStress: average(habits.map(h => h.stress_level || 5)),
        avgEnergy: average(energyScores.map(e => e.score)),
        avgSleep: average(habits.map(h => h.sleep_hours || 7)),
        exerciseDays: habits.filter(h => h.exercise_done).length,
        meditationDays: habits.filter(h => h.meditation_done).length,
    };
}

function average(arr: number[]): number {
    if (arr.length === 0) return 0;
    return Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10;
}

/**
 * Check effect on next day
 */
function checkNextDayEffect(
    matched: Array<DailyHabit & { energy: number }>,
    field: string,
    value: any
): { correlation: number; avgDrop: number } {
    // Simplified correlation check
    const withTrigger = matched.filter((m: any) => m[field] === value);
    const withoutTrigger = matched.filter((m: any) => m[field] !== value);

    if (withTrigger.length < 2 || withoutTrigger.length < 2) {
        return { correlation: 0, avgDrop: 0 };
    }

    const avgWith = average(withTrigger.map(m => m.energy));
    const avgWithout = average(withoutTrigger.map(m => m.energy));
    const drop = (avgWithout - avgWith) / avgWithout;

    return {
        correlation: Math.min(1, Math.abs(drop) * 2),
        avgDrop: drop,
    };
}

/**
 * Check same day effect
 */
function checkSameDayEffect(
    matched: Array<any>,
    field: string,
    value: any,
    outcomeField: string
): { correlation: number } {
    const withTrigger = matched.filter(m => m[field] === value && m[outcomeField] != null);
    const withoutTrigger = matched.filter(m => m[field] !== value && m[outcomeField] != null);

    if (withTrigger.length < 2 || withoutTrigger.length < 2) {
        return { correlation: 0 };
    }

    const avgWith = average(withTrigger.map(m => m[outcomeField]));
    const avgWithout = average(withoutTrigger.map(m => m[outcomeField]));
    const diff = Math.abs(avgWith - avgWithout) / 10;

    return { correlation: Math.min(1, diff * 2) };
}

/**
 * Generate AI summary
 */
async function generatePatternSummary(
    worstHabits: HabitPattern[],
    bestHabits: HabitPattern[],
    stats: any
): Promise<string> {
    const worst = worstHabits.slice(0, 2).map(h => h.habit.toLowerCase()).join(' and ');
    const best = bestHabits.slice(0, 2).map(h => h.habit.toLowerCase()).join(' and ');

    const prompt = `Week summary:
- Avg mood: ${stats.avgMood}/5
- Avg stress: ${stats.avgStress}/10
- Exercise days: ${stats.exerciseDays}/7
- Top challenges: ${worst || 'none identified'}
- Good habits: ${best || 'building momentum'}

In 2 sentences, give friendly feedback. Mention the main challenge and one thing to try today.`;

    // Use gemini if available, otherwise fallback
    try {
        const result = await generateWeeklySummary({
            avgSleep: stats.avgSleep,
            avgSteps: 0,
            avgEnergy: stats.avgEnergy,
            bestDay: 'varies',
            worstDay: 'varies',
        });
        return result;
    } catch {
        return generateFallbackSummary(worstHabits, bestHabits, stats);
    }
}

/**
 * Fallback summary without AI
 */
function generateFallbackSummary(
    worstHabits: HabitPattern[],
    bestHabits: HabitPattern[],
    stats: any
): string {
    const mainChallenge = worstHabits[0]?.habit || 'building consistency';
    const mainStrength = bestHabits[0]?.habit || 'showing up';

    if (stats.avgMood >= 4) {
        return `Good week overall! Your ${mainStrength.toLowerCase()} is really helping. Watch the ${mainChallenge.toLowerCase()} - small tweaks there could boost you even more. 🌟`;
    } else if (stats.avgMood >= 3) {
        return `Steady week. Keep up the ${mainStrength.toLowerCase()}! Focus on ${mainChallenge.toLowerCase()} today - even one small change helps. You've got this. 💪`;
    } else {
        return `Tough week - I see you. The ${mainChallenge.toLowerCase()} might be weighing on you. Try just one tiny improvement today. Small wins matter. 🌱`;
    }
}

/**
 * Get default analysis when not enough data
 */
function getDefaultAnalysis(message: string): PatternAnalysis {
    return {
        worstHabits: [],
        bestHabits: [],
        correlations: [],
        recommendations: [
            {
                action: 'Log your first habit check-in',
                reason: 'Building awareness is the first step',
                priority: 'high',
                category: 'tracking',
                icon: '📝',
            },
        ],
        summary: message,
        stats: {
            avgMood: 0,
            avgStress: 0,
            avgEnergy: 0,
            avgSleep: 0,
            exerciseDays: 0,
            meditationDays: 0,
        },
    };
}

/**
 * Save pattern analysis to database
 */
async function savePatternAnalysis(
    userId: string,
    startDate: Date,
    endDate: Date,
    analysis: PatternAnalysis
): Promise<void> {
    try {
        const weekStart = startDate.toISOString().split('T')[0];
        
        // Check if exists
        const { data: existing } = await supabase
            .from('habit_patterns')
            .select('id')
            .eq('user_id', userId)
            .eq('week_start', weekStart)
            .single();

        const patternData = {
            worst_habits: analysis.worstHabits,
            best_habits: analysis.bestHabits,
            correlations: analysis.correlations,
            recommendations: analysis.recommendations,
            avg_mood: analysis.stats.avgMood,
            avg_stress: analysis.stats.avgStress,
            avg_energy: analysis.stats.avgEnergy,
            avg_sleep_hours: analysis.stats.avgSleep,
            total_exercise_minutes: 0,
            pattern_summary: analysis.summary,
        };

        if (existing) {
            await supabase
                .from('habit_patterns')
                .update(patternData)
                .eq('id', existing.id);
        } else {
            await supabase
                .from('habit_patterns')
                .insert({
                    user_id: userId,
                    week_start: weekStart,
                    week_end: endDate.toISOString().split('T')[0],
                    ...patternData,
                });
        }
    } catch (error) {
        console.error('Error saving pattern analysis:', error);
    }
}

/**
 * Get today's recommendations based on recent patterns
 */
export async function getTodayRecommendations(userId: string): Promise<Recommendation[]> {
    // Get most recent pattern analysis
    const { data: pattern } = await supabase
        .from('habit_patterns')
        .select('recommendations, worst_habits')
        .eq('user_id', userId)
        .order('week_start', { ascending: false })
        .limit(1)
        .single();

    if (!pattern) {
        return [
            {
                action: 'Start tracking your daily habits',
                reason: 'Self-awareness is the key to improvement',
                priority: 'high',
                category: 'tracking',
                icon: '📝',
            },
        ];
    }

    // Get today's habits to personalize
    const today = new Date().toISOString().split('T')[0];
    const { data: todayHabits } = await supabase
        .from('daily_habits')
        .select('*')
        .eq('user_id', userId)
        .eq('date', today)
        .single();

    const recommendations = pattern.recommendations as Recommendation[];

    // Filter out recommendations for things already done today
    if (todayHabits) {
        return recommendations.filter(rec => {
            if (rec.category === 'exercise' && todayHabits.exercise_done) return false;
            if (rec.category === 'mindfulness' && todayHabits.meditation_done) return false;
            return true;
        });
    }

    return recommendations;
}
