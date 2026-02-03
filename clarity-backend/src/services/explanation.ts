import dotenv from 'dotenv';
import { generateEnergyExplanation, generateSmartActions } from './gemini';

dotenv.config();

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

interface ExplanationResult {
    score: number;
    explanation: string;
    actions: { id: string; title: string }[];
}

// Rule-based scoring logic
function calculateBaseScore(checkIns: CheckIn[], healthData: HealthData[]): number {
    let score = 5.0; // Start at neutral

    // Process morning check-in
    const morningCheckIn = checkIns.find(c => c.type === 'morning');
    if (morningCheckIn) {
        const data = morningCheckIn.data as { rested_score?: number; motivation_level?: string };
        if (data.rested_score) {
            // Rested score contributes 40% to final score
            score = score * 0.6 + (data.rested_score / 10) * 10 * 0.4;
        }
        if (data.motivation_level) {
            const motivationBonus = { low: -0.5, medium: 0, high: 0.5 };
            score += motivationBonus[data.motivation_level as keyof typeof motivationBonus] || 0;
        }
    }

    // Process midday check-in
    const middayCheckIn = checkIns.find(c => c.type === 'midday');
    if (middayCheckIn) {
        const data = middayCheckIn.data as { energy_level?: string; state?: string };
        if (data.energy_level) {
            const energyMod = { low: -1.0, ok: 0, high: 0.5 };
            score += energyMod[data.energy_level as keyof typeof energyMod] || 0;
        }
        if (data.state === 'mentally_drained' || data.state === 'physically_tired') {
            score -= 0.3;
        }
    }

    // Process evening check-in
    const eveningCheckIn = checkIns.find(c => c.type === 'evening');
    if (eveningCheckIn) {
        const data = eveningCheckIn.data as {
            day_vs_expectations?: string;
            late_caffeine?: boolean;
            skipped_meals?: boolean;
            alcohol?: boolean;
        };

        if (data.day_vs_expectations === 'worse') score -= 0.5;
        if (data.day_vs_expectations === 'better') score += 0.3;

        // Habit impacts
        if (data.late_caffeine) score -= 0.3;
        if (data.skipped_meals) score -= 0.2;
        if (data.alcohol) score -= 0.3;
    }

    // Process health data
    const sleepData = healthData.find(h => h.type === 'sleep');
    if (sleepData) {
        const data = sleepData.data as { duration_hours?: number };
        if (data.duration_hours) {
            if (data.duration_hours < 6) score -= 1.0;
            else if (data.duration_hours < 7) score -= 0.5;
            else if (data.duration_hours > 8) score += 0.3;
        }
    }

    // Clamp score between 1 and 10
    return Math.max(1, Math.min(10, Math.round(score * 10) / 10));
}

// Generate context for LLM
function buildContext(checkIns: CheckIn[], healthData: HealthData[]): string {
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
        parts.push(`Evening: Main drain was ${data.drain_source?.replace('_', ' ')}, day was ${data.day_vs_expectations} than expected`);

        const habits: string[] = [];
        if (data.late_caffeine) habits.push('late caffeine');
        if (data.skipped_meals) habits.push('skipped meals');
        if (data.alcohol) habits.push('alcohol');
        if (habits.length > 0) {
            parts.push(`Habits: ${habits.join(', ')}`);
        }
    }

    const sleepData = healthData.find(h => h.type === 'sleep');
    if (sleepData) {
        const data = sleepData.data as { duration_hours?: number; bedtime?: string };
        parts.push(`Sleep: ${data.duration_hours} hours${data.bedtime ? `, bedtime ${data.bedtime}` : ''}`);
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
        };
        const meetingParts: string[] = [];
        if (cal.meetingCount !== undefined) meetingParts.push(`${cal.meetingCount} meetings`);
        if (cal.meetingHours !== undefined) meetingParts.push(`${cal.meetingHours}h total`);
        if (cal.meetingDensity !== undefined) meetingParts.push(`${Math.round(cal.meetingDensity * 100)}% density`);
        if (cal.backToBack !== undefined && cal.backToBack > 0) meetingParts.push(`${cal.backToBack} back-to-back`);
        if (cal.lateMeetings !== undefined && cal.lateMeetings > 0) meetingParts.push(`${cal.lateMeetings} late meeting(s)`);

        if (meetingParts.length > 0) {
            parts.push(`Calendar: ${meetingParts.join(', ')}`);
        }
    }

    return parts.join('. ');
}

// Generate actions based on data
function generateActions(checkIns: CheckIn[], healthData: HealthData[]): { id: string; title: string }[] {
    const actions: { id: string; title: string }[] = [];

    const morningCheckIn = checkIns.find(c => c.type === 'morning');
    const eveningCheckIn = checkIns.find(c => c.type === 'evening');
    const sleepData = healthData.find(h => h.type === 'sleep');

    // Sleep-based actions
    if (sleepData) {
        const data = sleepData.data as { duration_hours?: number };
        if (data.duration_hours && data.duration_hours < 7) {
            actions.push({ id: 'sleep', title: 'Try to get to bed 30 minutes earlier tonight' });
        }
    }

    // Rested score actions
    if (morningCheckIn) {
        const data = morningCheckIn.data as { rested_score?: number };
        if (data.rested_score && data.rested_score < 5) {
            actions.push({ id: 'caffeine', title: 'Delay caffeine until 9:30am for better alertness' });
        }
    }

    // Evening check-in based actions
    if (eveningCheckIn) {
        const data = eveningCheckIn.data as {
            drain_source?: string;
            late_caffeine?: boolean;
            skipped_meals?: boolean;
        };

        if (data.drain_source === 'work') {
            actions.push({ id: 'break', title: 'Schedule a 15-minute break before your afternoon' });
        }

        if (data.skipped_meals) {
            actions.push({ id: 'meals', title: 'Set a reminder for lunch to maintain energy' });
        }
    }

    // Default action if none generated
    if (actions.length === 0) {
        actions.push({ id: 'walk', title: 'Take a 10-minute walk to refresh your energy' });
    }

    return actions.slice(0, 3); // Max 3 actions
}

export async function generateExplanation(
    userId: string,
    checkIns: CheckIn[],
    healthData: HealthData[]
): Promise<ExplanationResult> {
    const score = calculateBaseScore(checkIns, healthData);
    const context = buildContext(checkIns, healthData);
    const baseActions = generateActions(checkIns, healthData);

    // Try Gemini AI for explanation
    try {
        const explanation = await generateEnergyExplanation(score, context);

        // Try to get AI-powered smart actions
        let actions = baseActions;
        try {
            const smartActions = await generateSmartActions(score, context);
            if (smartActions.length > 0) {
                actions = smartActions.map(a => ({ id: a.id, title: a.title }));
            }
        } catch (actionError) {
            console.log('Using fallback actions');
        }

        return { score, explanation, actions };
    } catch (error) {
        console.error('Gemini API error, using fallback:', error);
    }

    // Fallback to rule-based explanation
    return {
        score,
        explanation: generateFallbackExplanation(score, checkIns),
        actions: baseActions,
    };
}

function generateFallbackExplanation(score: number, checkIns: CheckIn[]): string {
    const morningCheckIn = checkIns.find(c => c.type === 'morning');
    const eveningCheckIn = checkIns.find(c => c.type === 'evening');

    if (score >= 7) {
        return "You're having a good energy day! Your rest and recovery seem to be working well.";
    }

    if (score >= 5) {
        if (morningCheckIn) {
            const data = morningCheckIn.data as { rested_score?: number };
            if (data.rested_score && data.rested_score < 6) {
                return "You started the day a bit tired, which may be affecting your overall energy. Consider taking short breaks to recharge.";
            }
        }
        return "Your energy is moderate today. A short walk or break might help boost your afternoon.";
    }

    // Low score
    if (eveningCheckIn) {
        const data = eveningCheckIn.data as { drain_source?: string };
        const drainLabels: Record<string, string> = {
            poor_sleep: 'lack of quality sleep',
            work: 'mental effort',
            physical: 'physical exertion',
            emotional: 'emotional processing',
            poor_meals: 'irregular eating',
        };
        const drainLabel = drainLabels[data.drain_source || ''] || 'various factors';
        return `Your energy is lower today, likely due to ${drainLabel}. Small, gentle actions can help you feel better.`;
    }

    return "Your energy is lower than usual today. Be kind to yourself and focus on small, achievable tasks.";
}
