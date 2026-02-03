import { supabase } from '@/lib/supabase';
import { EnergyScore } from '@/types';
import { Platform } from 'react-native';

// Android emulator uses 10.0.2.2 to reach host machine
const getApiUrl = () => {
    if (Platform.OS === 'android' && !process.env.EXPO_PUBLIC_API_URL?.includes('10.0.2.2')) {
        return 'http://10.0.2.2:3000/api';
    }
    return process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';
};

const API_URL = getApiUrl();

interface CheckInStatus {
    morning: boolean;
    midday: boolean;
    evening: boolean;
}

/**
 * Get today's check-in status for the current user
 */
export async function getCheckInStatus(): Promise<CheckInStatus> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return { morning: false, midday: false, evening: false };
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const { data, error } = await supabase
            .from('check_ins')
            .select('type')
            .eq('user_id', user.id)
            .gte('created_at', today.toISOString());

        if (error) {
            console.error('Error fetching check-in status:', error);
            return { morning: false, midday: false, evening: false };
        }

        const types = data?.map(c => c.type) || [];
        return {
            morning: types.includes('morning'),
            midday: types.includes('midday'),
            evening: types.includes('evening'),
        };
    } catch (err) {
        console.error('getCheckInStatus error:', err);
        return { morning: false, midday: false, evening: false };
    }
}

/**
 * Get today's check-ins data for the current user
 */
export async function getTodayCheckIns(): Promise<Record<string, unknown>[]> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const { data, error } = await supabase
            .from('check_ins')
            .select('*')
            .eq('user_id', user.id)
            .gte('created_at', today.toISOString())
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Error fetching check-ins:', error);
            return [];
        }

        return data || [];
    } catch (err) {
        console.error('getTodayCheckIns error:', err);
        return [];
    }
}

/**
 * Get today's energy score from the backend API (with LLM explanations)
 * Includes timeout and retry logic to ensure AI-generated content is fetched
 */
export async function getTodayEnergyScoreFromAPI(): Promise<EnergyScore | null> {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return null;

        const today = new Date().toISOString().split('T')[0];

        console.log('🤖 Fetching energy score from backend API...');

        // Create an AbortController for timeout (15 seconds to allow LLM generation)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        try {
            const response = await fetch(`${API_URL}/energy?date=${today}`, {
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json',
                },
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                console.error('API error:', response.status);
                return null;
            }

            const result = await response.json();

            if (result.success && result.data) {
                console.log('✅ Got LLM-powered energy score:', result.data.score);
                return result.data as EnergyScore;
            }

            return null;
        } catch (fetchErr) {
            clearTimeout(timeoutId);
            if ((fetchErr as Error).name === 'AbortError') {
                console.log('⏱️ API request timed out after 15s');
            }
            throw fetchErr;
        }
    } catch (err) {
        console.error('API fetch error:', err);
        return null;
    }
}

/**
 * Regenerate today's energy score with fresh LLM explanation
 */
export async function regenerateEnergyScore(): Promise<EnergyScore | null> {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return null;

        console.log('🔄 Regenerating energy score with AI...');

        // Create an AbortController for timeout (20 seconds for regeneration)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);

        try {
            const response = await fetch(`${API_URL}/energy/regenerate`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json',
                },
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                console.error('Regenerate API error:', response.status);
                return null;
            }

            const result = await response.json();

            if (result.success && result.data) {
                console.log('✅ Regenerated energy score:', result.data.score);
                return result.data as EnergyScore;
            }

            return null;
        } catch (fetchErr) {
            clearTimeout(timeoutId);
            if ((fetchErr as Error).name === 'AbortError') {
                console.log('⏱️ Regenerate request timed out after 20s');
            }
            throw fetchErr;
        }
    } catch (err) {
        console.error('Regenerate error:', err);
        return null;
    }
}

/**
 * Calculate energy score locally (fallback when API unavailable)
 */
function calculateLocalEnergyScore(checkIns: Record<string, unknown>[]): number {
    if (checkIns.length === 0) return 0;

    let score = 5.0;

    for (const checkIn of checkIns) {
        const type = checkIn.type as string;
        const data = checkIn.data as Record<string, unknown>;

        if (type === 'morning') {
            const restedScore = data.rested_score as number;
            if (restedScore) {
                score = score * 0.6 + restedScore * 0.4;
            }
            const motivation = data.motivation_level as string;
            if (motivation === 'low') score -= 0.5;
            if (motivation === 'high') score += 0.5;
        }

        if (type === 'midday') {
            const energyLevel = data.energy_level as string;
            if (energyLevel === 'low') score -= 1.0;
            if (energyLevel === 'high') score += 0.5;
        }

        if (type === 'evening') {
            const comparison = data.day_vs_expectations as string;
            if (comparison === 'worse') score -= 0.5;
            if (comparison === 'better') score += 0.3;
            if (data.late_caffeine) score -= 0.3;
            if (data.skipped_meals) score -= 0.2;
            if (data.alcohol) score -= 0.3;
        }
    }

    return Math.max(1, Math.min(10, Math.round(score * 10) / 10));
}

/**
 * Generate a simple local explanation (fallback)
 */
function generateLocalExplanation(checkIns: Record<string, unknown>[], score: number): string {
    if (checkIns.length === 0) {
        return "Complete your first check-in to get personalized energy insights!";
    }

    const morning = checkIns.find(c => (c.type as string) === 'morning');
    if (morning) {
        const data = morning.data as Record<string, unknown>;
        const rested = data.rested_score as number;
        if (rested && rested < 5) {
            return "You started the day feeling tired. Consider taking short breaks and delaying caffeine for better alertness.";
        } else if (rested && rested >= 7) {
            return "You started the day well-rested! This is a great foundation for maintaining energy throughout the day.";
        }
    }

    if (score >= 7) {
        return "You're having a great energy day! Keep up the positive habits.";
    } else if (score >= 5) {
        return "Your energy is moderate today. A short walk or break might help boost your afternoon.";
    } else {
        return "Your energy is lower than usual. Be kind to yourself and focus on small, achievable tasks.";
    }
}

/**
 * Generate local action recommendations (fallback)
 */
function generateLocalActions(checkIns: Record<string, unknown>[], score: number): { id: string; title: string; reason: string }[] {
    const actions: { id: string; title: string; reason: string }[] = [];

    const morning = checkIns.find(c => (c.type as string) === 'morning');
    if (morning) {
        const data = morning.data as Record<string, unknown>;
        const rested = data.rested_score as number;
        if (rested && rested < 5) {
            actions.push({
                id: 'caffeine',
                title: 'Delay caffeine until 9:30am',
                reason: 'Boosts natural alertness'
            });
        }
    }

    if (score < 6) {
        actions.push({
            id: 'walk',
            title: 'Take a 10-minute walk',
            reason: 'Movement boosts energy'
        });
    }

    if (actions.length === 0) {
        actions.push({
            id: 'hydrate',
            title: 'Stay hydrated',
            reason: 'Water maintains energy levels'
        });
    }

    // Add more actions to fill up to 3
    if (actions.length < 3 && score < 5) {
        actions.push({
            id: 'breathe',
            title: 'Take 5 deep breaths',
            reason: 'Resets your nervous system'
        });
    }
    if (actions.length < 3) {
        actions.push({
            id: 'stretch',
            title: 'Do a quick stretch',
            reason: 'Releases physical tension'
        });
    }

    return actions.slice(0, 3);
}

/**
 * Get or generate today's energy score
 * Tries backend API first, falls back to local calculation
 * Backend handles caching and invalidation based on check-in changes
 */
export async function getTodayEnergyScore(): Promise<EnergyScore | null> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;

        // Try to get from backend API (handles caching automatically)
        const apiScore = await getTodayEnergyScoreFromAPI();

        if (apiScore) {
            return apiScore;
        }

        console.log('⚡ Backend unavailable, using local calculation...');

        // Fallback: Calculate locally
        const today = new Date().toISOString().split('T')[0];
        const checkIns = await getTodayCheckIns();

        if (checkIns.length === 0) {
            return null;
        }

        const score = calculateLocalEnergyScore(checkIns);
        const explanation = generateLocalExplanation(checkIns, score);
        const actions = generateLocalActions(checkIns, score);

        // Try to save locally calculated score
        const { data: newScore, error: insertError } = await supabase
            .from('energy_scores')
            .upsert({
                user_id: user.id,
                score,
                explanation,
                actions,
                date: today,
            }, { onConflict: 'user_id,date' })
            .select()
            .single();

        if (!insertError && newScore) {
            return newScore as EnergyScore;
        }

        // Return temporary score object
        return {
            id: 'temp',
            user_id: user.id,
            score,
            explanation,
            actions,
            date: today,
            created_at: new Date().toISOString(),
        };
    } catch (err) {
        console.error('getTodayEnergyScore error:', err);
        return null;
    }
}

/**
 * Submit feedback for an energy score explanation
 */
export async function submitFeedback(energyScoreId: string, matched: boolean): Promise<boolean> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || energyScoreId === 'temp') return false;

        const { error } = await supabase
            .from('explanation_feedback')
            .insert({
                user_id: user.id,
                energy_score_id: energyScoreId,
                matched,
            });

        if (error) {
            console.error('Error submitting feedback:', error);
            return false;
        }

        console.log('📝 Feedback submitted:', matched ? 'matched' : 'not matched');
        return true;
    } catch (err) {
        console.error('submitFeedback error:', err);
        return false;
    }
}

/**
 * Get yesterday's energy score for comparison
 */
export async function getYesterdayScore(): Promise<number | null> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        const { data, error } = await supabase
            .from('energy_scores')
            .select('score')
            .eq('user_id', user.id)
            .eq('date', yesterdayStr)
            .single();

        if (error || !data) {
            return null;
        }

        return data.score as number;
    } catch (err) {
        console.error('getYesterdayScore error:', err);
        return null;
    }
}

/**
 * Get user's baseline energy (7-day average)
 */
export async function getUserBaseline(): Promise<{ average: number; min: number; max: number } | null> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;

        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);

        const { data, error } = await supabase
            .from('energy_scores')
            .select('score')
            .eq('user_id', user.id)
            .gte('date', weekAgo.toISOString().split('T')[0])
            .order('date', { ascending: false });

        if (error || !data || data.length < 2) {
            return null;
        }

        const scores = data.map(d => d.score as number);
        const average = scores.reduce((a, b) => a + b, 0) / scores.length;
        const min = Math.min(...scores);
        const max = Math.max(...scores);

        return {
            average: Math.round(average * 10) / 10,
            min: Math.round(min * 10) / 10,
            max: Math.round(max * 10) / 10,
        };
    } catch (err) {
        console.error('getUserBaseline error:', err);
        return null;
    }
}

/**
 * Get quick micro-actions based on current score
 */
export function getQuickActions(score: number): Array<{ emoji: string; action: string; duration: string }> {
    if (score >= 7) {
        return [
            { emoji: '🚶', action: 'Keep moving', duration: '10 min' },
            { emoji: '💧', action: 'Stay hydrated', duration: '' },
            { emoji: '🌳', action: 'Enjoy outdoors', duration: '15 min' },
        ];
    } else if (score >= 5) {
        return [
            { emoji: '💧', action: 'Drink water', duration: '1 glass' },
            { emoji: '🚶', action: 'Quick walk', duration: '5 min' },
            { emoji: '🧘', action: 'Deep breaths', duration: '1 min' },
        ];
    } else {
        return [
            { emoji: '💧', action: 'Hydrate now', duration: 'big glass' },
            { emoji: '🌬️', action: 'Step outside', duration: '3 min' },
            { emoji: '😌', action: 'Rest briefly', duration: '5 min' },
        ];
    }
}
