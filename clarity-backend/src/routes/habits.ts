import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { supabase } from '../utils/supabase';

const router = Router();

// Daily habit data interface
interface DailyHabit {
    // Caffeine
    caffeine_cups?: number;
    caffeine_last_time?: string;
    caffeine_late?: boolean;
    
    // Sleep
    sleep_hours?: number;
    sleep_quality?: 'poor' | 'fair' | 'good' | 'excellent';
    sleep_time?: string;
    wake_time?: string;
    naps_taken?: number;
    
    // Alcohol
    alcohol_drinks?: number;
    alcohol_type?: string;
    
    // Exercise
    exercise_done?: boolean;
    exercise_type?: string;
    exercise_duration?: number;
    exercise_intensity?: 'light' | 'moderate' | 'intense';
    
    // Meals
    meals_count?: number;
    meals_skipped?: string;
    meals_quality?: 'unhealthy' | 'mixed' | 'healthy';
    water_glasses?: number;
    
    // Screen time
    screen_time_hours?: number;
    screen_before_bed?: boolean;
    social_media_hours?: number;
    
    // Mental health
    mood?: 'very_low' | 'low' | 'neutral' | 'good' | 'great';
    stress_level?: number;
    anxiety_level?: number;
    anger_incidents?: number;
    
    // Social & Environment
    social_interaction?: 'none' | 'minimal' | 'moderate' | 'lots';
    outdoor_time?: number;
    nature_exposure?: boolean;
    
    // Mindfulness
    meditation_done?: boolean;
    meditation_minutes?: number;
    journaling_done?: boolean;
    gratitude_practiced?: boolean;
    
    // Work
    work_hours?: number;
    work_stress?: 'low' | 'moderate' | 'high' | 'extreme';
    breaks_taken?: number;
    productive_feeling?: boolean;
    
    // Negative habits
    smoking?: boolean;
    junk_food?: boolean;
    late_night_eating?: boolean;
    
    notes?: string;
}

// Log daily habits (create or update for today)
router.post('/', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const habitData: DailyHabit = req.body;
        const date = req.body.date || new Date().toISOString().split('T')[0];

        // Check if entry exists for this date
        const { data: existing } = await supabase
            .from('daily_habits')
            .select('id')
            .eq('user_id', userId)
            .eq('date', date)
            .single();

        let result;
        if (existing) {
            // Update existing entry
            const { data, error } = await supabase
                .from('daily_habits')
                .update({
                    ...habitData,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', existing.id)
                .select()
                .single();

            if (error) throw error;
            result = data;
        } else {
            // Create new entry
            const { data, error } = await supabase
                .from('daily_habits')
                .insert({
                    user_id: userId,
                    date,
                    ...habitData,
                })
                .select()
                .single();

            if (error) throw error;
            result = data;
        }

        console.log(`📊 Habits logged for ${userId} on ${date}`);
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('Error logging habits:', error);
        res.status(500).json({ success: false, error: 'Failed to log habits' });
    }
});

// Get habits for a specific date
router.get('/date/:date', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const { date } = req.params;

        const { data, error } = await supabase
            .from('daily_habits')
            .select('*')
            .eq('user_id', userId)
            .eq('date', date)
            .single();

        if (error && error.code !== 'PGRST116') throw error;

        res.json({ success: true, data: data || null });
    } catch (error) {
        console.error('Error fetching habits:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch habits' });
    }
});

// Get habits for today
router.get('/today', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const today = new Date().toISOString().split('T')[0];

        const { data, error } = await supabase
            .from('daily_habits')
            .select('*')
            .eq('user_id', userId)
            .eq('date', today)
            .single();

        if (error && error.code !== 'PGRST116') throw error;

        res.json({ success: true, data: data || null });
    } catch (error) {
        console.error('Error fetching today habits:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch habits' });
    }
});

// Get habits history (last N days)
router.get('/history', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const days = parseInt(req.query.days as string) || 7;

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const { data, error } = await supabase
            .from('daily_habits')
            .select('*')
            .eq('user_id', userId)
            .gte('date', startDate.toISOString().split('T')[0])
            .order('date', { ascending: false });

        if (error) throw error;

        res.json({ success: true, data: data || [] });
    } catch (error) {
        console.error('Error fetching habits history:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch habits history' });
    }
});

// Quick log endpoint for common habit updates
router.post('/quick', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const { habit, value } = req.body;
        const today = new Date().toISOString().split('T')[0];

        // Validate habit name
        const validHabits = [
            'caffeine_cups', 'caffeine_late', 'alcohol_drinks', 'exercise_done',
            'meditation_done', 'water_glasses', 'mood', 'stress_level',
            'screen_before_bed', 'junk_food', 'smoking', 'anger_incidents'
        ];

        if (!validHabits.includes(habit)) {
            return res.status(400).json({ success: false, error: 'Invalid habit name' });
        }

        // Upsert the habit
        const { data: existing } = await supabase
            .from('daily_habits')
            .select('id')
            .eq('user_id', userId)
            .eq('date', today)
            .single();

        const updateData = { [habit]: value };

        if (existing) {
            await supabase
                .from('daily_habits')
                .update(updateData)
                .eq('id', existing.id);
        } else {
            await supabase
                .from('daily_habits')
                .insert({
                    user_id: userId,
                    date: today,
                    ...updateData,
                });
        }

        res.json({ success: true, message: `${habit} updated` });
    } catch (error) {
        console.error('Error quick logging habit:', error);
        res.status(500).json({ success: false, error: 'Failed to log habit' });
    }
});

// Get habit summary stats
router.get('/summary', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const days = parseInt(req.query.days as string) || 7;

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const { data: habits, error } = await supabase
            .from('daily_habits')
            .select('*')
            .eq('user_id', userId)
            .gte('date', startDate.toISOString().split('T')[0]);

        if (error) throw error;

        if (!habits || habits.length === 0) {
            return res.json({
                success: true,
                data: {
                    daysTracked: 0,
                    summary: null,
                },
            });
        }

        // Calculate averages and totals
        const summary = {
            daysTracked: habits.length,
            
            // Caffeine
            avgCaffeine: average(habits, 'caffeine_cups'),
            lateCaffeineDays: count(habits, 'caffeine_late', true),
            
            // Sleep
            avgSleep: average(habits, 'sleep_hours'),
            goodSleepDays: countIn(habits, 'sleep_quality', ['good', 'excellent']),
            
            // Alcohol
            totalDrinks: sum(habits, 'alcohol_drinks'),
            drinkingDays: countGreaterThan(habits, 'alcohol_drinks', 0),
            
            // Exercise
            exerciseDays: count(habits, 'exercise_done', true),
            totalExerciseMinutes: sum(habits, 'exercise_duration'),
            
            // Meals & Hydration
            avgMeals: average(habits, 'meals_count'),
            avgWater: average(habits, 'water_glasses'),
            
            // Screen time
            avgScreenTime: average(habits, 'screen_time_hours'),
            screenBeforeBedDays: count(habits, 'screen_before_bed', true),
            
            // Mental health
            avgMood: moodToNumber(habits),
            avgStress: average(habits, 'stress_level'),
            avgAnxiety: average(habits, 'anxiety_level'),
            angerDays: countGreaterThan(habits, 'anger_incidents', 0),
            
            // Mindfulness
            meditationDays: count(habits, 'meditation_done', true),
            totalMeditationMinutes: sum(habits, 'meditation_minutes'),
            
            // Negative habits
            smokingDays: count(habits, 'smoking', true),
            junkFoodDays: count(habits, 'junk_food', true),
        };

        res.json({ success: true, data: summary });
    } catch (error) {
        console.error('Error fetching habit summary:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch summary' });
    }
});

// Helper functions for calculations
function average(arr: any[], field: string): number {
    const values = arr.filter(item => item[field] != null).map(item => item[field]);
    if (values.length === 0) return 0;
    return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

function sum(arr: any[], field: string): number {
    return arr.reduce((total, item) => total + (item[field] || 0), 0);
}

function count(arr: any[], field: string, value: any): number {
    return arr.filter(item => item[field] === value).length;
}

function countIn(arr: any[], field: string, values: any[]): number {
    return arr.filter(item => values.includes(item[field])).length;
}

function countGreaterThan(arr: any[], field: string, threshold: number): number {
    return arr.filter(item => (item[field] || 0) > threshold).length;
}

function moodToNumber(arr: any[]): number {
    const moodMap: Record<string, number> = {
        'very_low': 1,
        'low': 2,
        'neutral': 3,
        'good': 4,
        'great': 5,
    };
    const values = arr.filter(item => item.mood).map(item => moodMap[item.mood] || 3);
    if (values.length === 0) return 0;
    return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

export default router;
