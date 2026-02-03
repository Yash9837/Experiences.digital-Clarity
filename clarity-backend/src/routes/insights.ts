import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { supabase } from '../utils/supabase';
import { analyzeWeeklyPatterns, getTodayRecommendations } from '../services/patternRecognition';
import { generatePatternInsights, HabitDataSummary } from '../services/gemini';

const router = Router();

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
    scoreChange: number; // Compared to previous week
}

// Get weekly insights with energy trends and check-in history
router.get('/weekly', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user!.id;

        // Get last 7 days
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);

        // Get last 14 days for comparison
        const prevStartDate = new Date();
        prevStartDate.setDate(prevStartDate.getDate() - 14);

        // Fetch energy scores for the last 7 days
        const { data: energyScores, error: scoresError } = await supabase
            .from('energy_scores')
            .select('*')
            .eq('user_id', userId)
            .gte('date', startDate.toISOString().split('T')[0])
            .order('date', { ascending: true });

        if (scoresError) throw scoresError;

        // Fetch check-ins for the last 7 days
        const { data: checkIns, error: checkInsError } = await supabase
            .from('check_ins')
            .select('*')
            .eq('user_id', userId)
            .gte('created_at', startDate.toISOString())
            .order('created_at', { ascending: true });

        if (checkInsError) throw checkInsError;

        // Fetch previous week's scores for comparison
        const { data: prevScores } = await supabase
            .from('energy_scores')
            .select('score')
            .eq('user_id', userId)
            .gte('date', prevStartDate.toISOString().split('T')[0])
            .lt('date', startDate.toISOString().split('T')[0]);

        // Build daily data map
        const dailyData: Map<string, DayData> = new Map();

        // Initialize last 7 days
        for (let i = 0; i < 7; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            dailyData.set(dateStr, {
                date: dateStr,
                score: null,
                checkInCount: 0,
                morning: false,
                midday: false,
                evening: false,
            });
        }

        // Fill in energy scores
        energyScores?.forEach(score => {
            const existing = dailyData.get(score.date);
            if (existing) {
                existing.score = score.score;
            }
        });

        // Fill in check-in data
        checkIns?.forEach(checkIn => {
            const dateStr = new Date(checkIn.created_at).toISOString().split('T')[0];
            const existing = dailyData.get(dateStr);
            if (existing) {
                existing.checkInCount++;
                if (checkIn.type === 'morning') existing.morning = true;
                if (checkIn.type === 'midday') existing.midday = true;
                if (checkIn.type === 'evening') existing.evening = true;
            }
        });

        // Calculate stats
        const daysArray = Array.from(dailyData.values()).reverse(); // Oldest first
        const daysWithScores = daysArray.filter(d => d.score !== null);
        const scores = daysWithScores.map(d => d.score!);

        const averageScore = scores.length > 0
            ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
            : 0;

        const totalCheckIns = checkIns?.length || 0;

        let bestDay: string | null = null;
        let worstDay: string | null = null;
        let maxScore = -1;
        let minScore = 11;

        daysWithScores.forEach(d => {
            if (d.score! > maxScore) {
                maxScore = d.score!;
                bestDay = d.date;
            }
            if (d.score! < minScore) {
                minScore = d.score!;
                worstDay = d.date;
            }
        });

        // Calculate week-over-week change
        const prevAverage = prevScores && prevScores.length > 0
            ? prevScores.reduce((a, b) => a + b.score, 0) / prevScores.length
            : averageScore;
        const scoreChange = Math.round((averageScore - prevAverage) * 10) / 10;

        const stats: WeeklyStats = {
            averageScore,
            totalCheckIns,
            daysWithData: daysWithScores.length,
            bestDay,
            worstDay,
            scoreChange,
        };

        res.json({
            success: true,
            data: {
                days: daysArray,
                stats,
            },
        });
    } catch (error) {
        console.error('Error fetching weekly insights:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch weekly insights' });
    }
});

// Get check-in history (paginated)
router.get('/history', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const { limit = '20', offset = '0' } = req.query;

        const { data: checkIns, error, count } = await supabase
            .from('check_ins')
            .select('*', { count: 'exact' })
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .range(parseInt(offset as string), parseInt(offset as string) + parseInt(limit as string) - 1);

        if (error) throw error;

        // Group by date
        const grouped: Record<string, typeof checkIns> = {};
        checkIns?.forEach(checkIn => {
            const dateStr = new Date(checkIn.created_at).toISOString().split('T')[0];
            if (!grouped[dateStr]) grouped[dateStr] = [];
            grouped[dateStr].push(checkIn);
        });

        res.json({
            success: true,
            data: {
                checkIns,
                grouped,
                total: count || 0,
                hasMore: (parseInt(offset as string) + parseInt(limit as string)) < (count || 0),
            },
        });
    } catch (error) {
        console.error('Error fetching history:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch history' });
    }
});

// Get energy score history for charts
router.get('/energy-history', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const { days = '30' } = req.query;

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days as string));

        const { data: scores, error } = await supabase
            .from('energy_scores')
            .select('date, score, explanation')
            .eq('user_id', userId)
            .gte('date', startDate.toISOString().split('T')[0])
            .order('date', { ascending: true });

        if (error) throw error;

        res.json({
            success: true,
            data: scores || [],
        });
    } catch (error) {
        console.error('Error fetching energy history:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch energy history' });
    }
});

// Get patterns and AI-generated insights
router.get('/patterns', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user!.id;

        // Get last 30 days of data
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);

        const { data: checkIns } = await supabase
            .from('check_ins')
            .select('*')
            .eq('user_id', userId)
            .gte('created_at', startDate.toISOString())
            .order('created_at', { ascending: true });

        const { data: energyScores } = await supabase
            .from('energy_scores')
            .select('*')
            .eq('user_id', userId)
            .gte('date', startDate.toISOString().split('T')[0])
            .order('date', { ascending: true });

        // Analyze patterns
        const patterns: string[] = [];

        // Sleep pattern analysis (from morning check-ins)
        const morningCheckIns = checkIns?.filter(c => c.type === 'morning') || [];
        if (morningCheckIns.length >= 5) {
            const avgRested = morningCheckIns.reduce((sum, c) => {
                const data = c.data as { rested_score?: number };
                return sum + (data.rested_score || 5);
            }, 0) / morningCheckIns.length;

            if (avgRested < 5) {
                patterns.push("💤 Your rested scores are often low. Consider improving your sleep routine.");
            } else if (avgRested >= 7) {
                patterns.push("🌟 You're consistently well-rested! Your sleep routine seems to be working.");
            }
        }

        // Energy dip pattern (from midday check-ins)
        const middayCheckIns = checkIns?.filter(c => c.type === 'midday') || [];
        if (middayCheckIns.length >= 5) {
            const lowEnergyDays = middayCheckIns.filter(c => {
                const data = c.data as { energy_level?: string };
                return data.energy_level === 'low';
            }).length;

            if (lowEnergyDays / middayCheckIns.length > 0.4) {
                patterns.push("📉 You often experience mid-day energy dips. Try a short walk or healthy snack around noon.");
            }
        }

        // Evening habit analysis
        const eveningCheckIns = checkIns?.filter(c => c.type === 'evening') || [];
        if (eveningCheckIns.length >= 5) {
            const lateCaffeine = eveningCheckIns.filter(c => {
                const data = c.data as { late_caffeine?: boolean };
                return data.late_caffeine;
            }).length;

            if (lateCaffeine / eveningCheckIns.length > 0.3) {
                patterns.push("☕ Late caffeine might be affecting your sleep. Try cutting off by 2 PM.");
            }
        }

        // Weekly trend
        if (energyScores && energyScores.length >= 7) {
            const recentScores = energyScores.slice(-7);
            const firstHalf = recentScores.slice(0, 3);
            const secondHalf = recentScores.slice(-3);

            const firstAvg = firstHalf.reduce((sum, s) => sum + s.score, 0) / firstHalf.length;
            const secondAvg = secondHalf.reduce((sum, s) => sum + s.score, 0) / secondHalf.length;

            if (secondAvg - firstAvg > 0.5) {
                patterns.push("📈 Your energy has been trending upward this week. Keep it up!");
            } else if (firstAvg - secondAvg > 0.5) {
                patterns.push("📉 Your energy has dipped lately. Consider what changed recently.");
            }
        }

        if (patterns.length === 0 && (checkIns?.length || 0) < 10) {
            patterns.push("📊 Keep checking in! We need more data to identify your patterns.");
        }

        res.json({
            success: true,
            data: {
                patterns,
                checkInCount: checkIns?.length || 0,
                daysOfData: energyScores?.length || 0,
            },
        });
    } catch (error) {
        console.error('Error analyzing patterns:', error);
        res.status(500).json({ success: false, error: 'Failed to analyze patterns' });
    }
});

// =====================================================
// HABIT PATTERN RECOGNITION ENDPOINTS
// =====================================================

// Get weekly habit pattern analysis
router.get('/habit-patterns', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user!.id;

        const analysis = await analyzeWeeklyPatterns(userId);

        res.json({
            success: true,
            data: analysis,
        });
    } catch (error) {
        console.error('Error analyzing habit patterns:', error);
        res.status(500).json({ success: false, error: 'Failed to analyze habit patterns' });
    }
});

// Get today's personalized recommendations
router.get('/recommendations', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user!.id;

        const recommendations = await getTodayRecommendations(userId);

        res.json({
            success: true,
            data: recommendations,
        });
    } catch (error) {
        console.error('Error fetching recommendations:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch recommendations' });
    }
});

// Get worst habits summary (quick endpoint for Today screen)
router.get('/worst-habits', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user!.id;

        // Get most recent pattern analysis
        const { data: pattern } = await supabase
            .from('habit_patterns')
            .select('worst_habits, recommendations, pattern_summary')
            .eq('user_id', userId)
            .order('week_start', { ascending: false })
            .limit(1)
            .single();

        if (!pattern) {
            return res.json({
                success: true,
                data: {
                    worstHabits: [],
                    topRecommendation: 'Start tracking your daily habits to get personalized insights!',
                    summary: 'Keep logging to discover your patterns.',
                },
            });
        }

        const worstHabits = (pattern.worst_habits as any[]) || [];
        const recommendations = (pattern.recommendations as any[]) || [];

        res.json({
            success: true,
            data: {
                worstHabits: worstHabits.slice(0, 3),
                topRecommendation: recommendations[0]?.action || 'Keep up the good work!',
                summary: pattern.pattern_summary,
            },
        });
    } catch (error) {
        console.error('Error fetching worst habits:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch worst habits' });
    }
});

// =====================================================
// AHA MOMENT CARDS - New simplified insights format
// =====================================================

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

// Get aha-moment cards for the new Insights UI - LLM-powered
router.get('/aha-cards', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user!.id;

        // Get date range for last 7 days
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        const startDateStr = startDate.toISOString().split('T')[0];

        // Fetch check-ins
        const { data: checkIns } = await supabase
            .from('check_ins')
            .select('*')
            .eq('user_id', userId)
            .gte('created_at', startDate.toISOString())
            .order('created_at', { ascending: true });

        // Fetch daily habits
        const { data: habits } = await supabase
            .from('daily_habits')
            .select('*')
            .eq('user_id', userId)
            .gte('date', startDateStr)
            .order('date', { ascending: true });

        // Fetch energy scores
        const { data: energyScores } = await supabase
            .from('energy_scores')
            .select('*')
            .eq('user_id', userId)
            .gte('date', startDateStr)
            .order('date', { ascending: true });

        // Check if we have enough data
        const totalCheckIns = checkIns?.length || 0;
        const totalHabits = habits?.length || 0;
        const hasEnoughData = totalCheckIns >= 3 || totalHabits >= 2;

        if (!hasEnoughData) {
            // Return default empty state
            return res.json({
                success: true,
                data: {
                    drainCard: null,
                    boosterCard: null,
                    experiment: {
                        focus: 'Start Tracking',
                        emoji: '📝',
                        goal: 'Build awareness of your daily patterns',
                        action: 'Complete your morning, midday, and evening check-ins',
                        howTo: 'Set reminders to check in 3 times a day',
                        commitment: 'Just try it for 3 days',
                        checkInDay: 'Friday'
                    },
                    hasEnoughData: false,
                },
            });
        }

        // Aggregate check-in data
        const morningCheckIns = checkIns?.filter(c => c.type === 'morning') || [];
        const middayCheckIns = checkIns?.filter(c => c.type === 'midday') || [];
        const eveningCheckIns = checkIns?.filter(c => c.type === 'evening') || [];

        const avgRested = morningCheckIns.length > 0
            ? morningCheckIns.reduce((sum, c) => {
                const data = c.data as { rested_score?: number };
                return sum + (data.rested_score || 5);
            }, 0) / morningCheckIns.length
            : undefined;

        const middayEnergyLevels = middayCheckIns
            .map(c => (c.data as { energy_level?: string }).energy_level)
            .filter(Boolean) as string[];

        const eveningDrainSources = eveningCheckIns
            .map(c => (c.data as { energy_drain?: string }).energy_drain)
            .filter(Boolean) as string[];

        // Aggregate habit data
        const totalDays = habits?.length || 7;
        const lateCaffeineDays = habits?.filter(h => h.caffeine_late).length || 0;
        const avgCaffeineCups = habits?.reduce((sum, h) => sum + (h.caffeine_cups || 0), 0) / Math.max(totalDays, 1);
        const avgSleepHours = habits?.reduce((sum, h) => sum + (h.sleep_hours || 7), 0) / Math.max(totalDays, 1);
        const poorSleepDays = habits?.filter(h => h.sleep_hours && h.sleep_hours < 6).length || 0;
        const exerciseDays = habits?.filter(h => h.exercise_done).length || 0;
        const alcoholDays = habits?.filter(h => (h.alcohol_drinks || 0) > 0).length || 0;
        const totalDrinks = habits?.reduce((sum, h) => sum + (h.alcohol_drinks || 0), 0) || 0;
        const highStressDays = habits?.filter(h => h.stress_level && h.stress_level >= 7).length || 0;
        const meditationDays = habits?.filter(h => h.meditation_done).length || 0;
        const screenBeforeBedDays = habits?.filter(h => h.screen_before_bed).length || 0;
        const junkFoodDays = habits?.filter(h => h.junk_food).length || 0;
        const skippedMealsDays = habits?.filter(h => h.meals_skipped).length || 0;
        const outdoorDays = habits?.filter(h => h.outdoor_time && h.outdoor_time >= 30).length || 0;

        // Calculate energy trend
        const scores = energyScores?.map(e => e.score) || [];
        const avgEnergy = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 5;
        let trend: 'up' | 'down' | 'stable' = 'stable';
        if (scores.length >= 3) {
            const firstHalf = scores.slice(0, Math.floor(scores.length / 2));
            const secondHalf = scores.slice(Math.floor(scores.length / 2));
            const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
            const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
            if (secondAvg - firstAvg > 0.5) trend = 'up';
            else if (firstAvg - secondAvg > 0.5) trend = 'down';
        }

        // Find best/worst days
        let bestDay: string | undefined;
        let worstDay: string | undefined;
        if (energyScores && energyScores.length > 0) {
            const sorted = [...energyScores].sort((a, b) => b.score - a.score);
            bestDay = new Date(sorted[0].date).toLocaleDateString('en-US', { weekday: 'long' });
            worstDay = new Date(sorted[sorted.length - 1].date).toLocaleDateString('en-US', { weekday: 'long' });
        }

        // Build habit data summary for LLM
        const habitDataSummary: HabitDataSummary = {
            checkIns: {
                morning: { count: morningCheckIns.length, avgRested, motivationLevels: [] },
                midday: { count: middayCheckIns.length, energyLevels: middayEnergyLevels, states: [] },
                evening: { count: eveningCheckIns.length, drainSources: eveningDrainSources, expectations: [] },
            },
            habits: {
                lateCaffeineDays,
                avgCaffeineCups,
                avgSleepHours,
                poorSleepDays,
                exerciseDays,
                alcoholDays,
                totalDrinks,
                highStressDays,
                meditationDays,
                screenBeforeBedDays,
                junkFoodDays,
                skippedMealsDays,
                outdoorDays,
                totalDays,
            },
            energyScores: {
                average: avgEnergy,
                trend,
                bestDay,
                worstDay,
            },
        };

        console.log('🤖 Calling LLM for pattern insights...');
        const llmInsights = await generatePatternInsights(habitDataSummary);
        console.log('✅ LLM pattern insights generated');

        // Add type field for frontend compatibility
        const drainCard = llmInsights.drainCard ? { ...llmInsights.drainCard, type: 'drain' as const } : null;
        const boosterCard = llmInsights.boosterCard ? { ...llmInsights.boosterCard, type: 'booster' as const } : null;

        res.json({
            success: true,
            data: {
                drainCard,
                boosterCard,
                todayCard: llmInsights.todayCard,
                experiment: llmInsights.experiment,
                hasEnoughData: true,
            },
        });
    } catch (error) {
        console.error('Error generating aha cards:', error);
        res.status(500).json({ success: false, error: 'Failed to generate insight cards' });
    }
});

// Helper functions for aha-moment cards
function getHabitContext(habit: string): string {
    const contexts: Record<string, string> = {
        'Late caffeine': 'after 3 PM',
        'Poor sleep': 'less than 6 hours',
        'Skipped meals': 'especially breakfast',
        'Alcohol': 'even 1-2 drinks affected next day',
        'Screen before bed': 'within 1 hour of sleep',
        'High stress': 'multiple high-stress days',
        'Late night eating': 'after 9 PM',
        'No exercise': 'for several days in a row',
        'Junk food': 'multiple times this week',
    };
    return contexts[habit] || 'regularly this week';
}

function getHabitAction(habit: string): string {
    const actions: Record<string, string> = {
        'Late caffeine': 'Try switching to herbal tea after 2 PM',
        'Poor sleep': 'Aim for 7+ hours tonight - wind down 30 min earlier',
        'Skipped meals': 'Prep a quick breakfast option tonight',
        'Alcohol': 'Try 2-3 alcohol-free days this week',
        'Screen before bed': 'Set your phone to charge outside the bedroom',
        'High stress': 'Block 10 min today for a calming activity',
        'Late night eating': 'Have a filling dinner by 7 PM',
        'No exercise': 'Start with just a 10-minute walk today',
        'Junk food': 'Swap one snack for fruit or nuts',
    };
    return actions[habit] || 'Try to reduce this habit today';
}

function getBoosterContext(habit: string): string {
    const contexts: Record<string, string> = {
        'Exercise': 'morning movement especially',
        'Good sleep': 'consistent 7+ hours',
        'Meditation': 'even just 5 minutes helped',
        'Outdoor time': 'walks before 10 AM',
        'Healthy eating': 'balanced meals throughout the day',
        'Hydration': 'drinking enough water',
        'Social connection': 'quality time with others',
        'Morning routine': 'consistent wake time',
    };
    return contexts[habit] || 'when you did this';
}

function getBoosterImpact(habit: string): string {
    const impacts: Record<string, string> = {
        'Exercise': 'Better mood and sustained focus until noon',
        'Good sleep': 'Higher energy and mental clarity',
        'Meditation': 'Lower stress and better emotional balance',
        'Outdoor time': 'Improved mood and more alertness',
        'Healthy eating': 'Stable energy without crashes',
        'Hydration': 'Better focus and fewer headaches',
        'Social connection': 'Boosted mood and sense of purpose',
        'Morning routine': 'Easier mornings and momentum for the day',
    };
    return impacts[habit] || 'This boosted your energy';
}

function getBoosterAction(habit: string): string {
    const actions: Record<string, string> = {
        'Exercise': 'Try 5 min of movement within 30 min of waking',
        'Good sleep': 'Keep your bedtime consistent tonight too',
        'Meditation': 'Do another 5 min session today',
        'Outdoor time': 'Step outside for a few minutes this morning',
        'Healthy eating': 'Plan a balanced lunch today',
        'Hydration': 'Keep a water bottle visible at your desk',
        'Social connection': 'Reach out to someone today',
        'Morning routine': 'Protect your morning time tomorrow',
    };
    return actions[habit] || 'Keep doing this!';
}

function generateWeeklyExperiment(analysis: any): WeeklyExperiment {
    // Generate experiment based on worst habits
    const experiments: WeeklyExperiment[] = [
        {
            focus: 'Caffeine reset',
            emoji: '☕',
            goal: 'Improve evening restfulness and sleep quality',
            action: 'No caffeine after 2 PM for 3 days',
            howTo: 'Set a 2 PM reminder, switch to herbal tea',
            commitment: 'Just try it for 3 days',
            checkInDay: 'Friday',
        },
        {
            focus: 'Meeting recovery',
            emoji: '📅',
            goal: 'Prevent post-meeting energy crashes',
            action: 'Block 10 minutes after every long meeting',
            howTo: 'Add buffer time to your calendar',
            commitment: 'Try it for 3 meetings this week',
            checkInDay: 'Friday',
        },
        {
            focus: 'Morning sunlight',
            emoji: '🌅',
            goal: 'Boost morning energy and alertness',
            action: 'Get outside within 30 min of waking',
            howTo: 'Take your coffee outside or walk to get it',
            commitment: 'Try it for 3 mornings',
            checkInDay: 'Friday',
        },
        {
            focus: 'Screen-free sleep',
            emoji: '📵',
            goal: 'Fall asleep faster and sleep deeper',
            action: 'No screens 30 min before bed',
            howTo: 'Charge your phone in another room',
            commitment: 'Try it for 3 nights',
            checkInDay: 'Friday',
        },
        {
            focus: 'Movement breaks',
            emoji: '🚶',
            goal: 'Prevent afternoon energy dips',
            action: 'Walk for 5 minutes every 2 hours',
            howTo: 'Set reminders or use a standing desk timer',
            commitment: 'Try it for 2 days',
            checkInDay: 'Friday',
        },
    ];

    // Pick experiment based on worst habits
    if (analysis.worstHabits?.some((h: any) => h.habit.toLowerCase().includes('caffeine'))) {
        return experiments[0];
    } else if (analysis.worstHabits?.some((h: any) => h.habit.toLowerCase().includes('stress'))) {
        return experiments[1];
    } else if (analysis.worstHabits?.some((h: any) => h.habit.toLowerCase().includes('sleep'))) {
        return experiments[3];
    } else if (analysis.worstHabits?.some((h: any) => h.habit.toLowerCase().includes('exercise'))) {
        return experiments[4];
    }

    // Default: morning sunlight
    return experiments[2];
}

export default router;
