import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { supabase } from '../utils/supabase';
import { recalculateEnergyScore } from '../services/energyCalculator';

const router = Router();

/**
 * Extract habit data from check-ins and save to daily_habits table
 */
async function saveHabitsFromCheckIn(
    userId: string,
    type: string,
    data: Record<string, unknown>
): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    
    // Build habit updates based on check-in type
    const habitUpdates: Record<string, unknown> = {};
    
    if (type === 'morning') {
        // Morning check-in captures: rested score, sleep quality indicators
        if (data.rested_score !== undefined) {
            // Convert 1-10 rested score to sleep quality enum
            const rested = data.rested_score as number;
            if (rested >= 8) habitUpdates.sleep_quality = 'excellent';
            else if (rested >= 6) habitUpdates.sleep_quality = 'good';
            else if (rested >= 4) habitUpdates.sleep_quality = 'fair';
            else habitUpdates.sleep_quality = 'poor';
        }
        if (data.motivation_level !== undefined) {
            // Map motivation to mood
            const motivation = data.motivation_level as string;
            if (motivation === 'high') habitUpdates.mood = 'great';
            else if (motivation === 'medium') habitUpdates.mood = 'good';
            else habitUpdates.mood = 'low';
        }
        // New morning sleep fields
        if (data.woke_on_time !== undefined) {
            habitUpdates.woke_on_time = data.woke_on_time;
        }
        if (data.sleep_felt_complete !== undefined) {
            habitUpdates.sleep_felt_complete = data.sleep_felt_complete;
        }
    }
    
    if (type === 'midday') {
        // Midday check-in captures: energy level, stress, current state
        if (data.energy_level !== undefined) {
            const energy = data.energy_level as string;
            if (energy === 'low') {
                habitUpdates.stress_level = 6;
            } else if (energy === 'ok') {
                habitUpdates.stress_level = 4;
            } else {
                habitUpdates.stress_level = 2;
            }
        }
        if (data.state !== undefined) {
            const state = data.state as string;
            if (state === 'mentally_drained') {
                habitUpdates.stress_level = 7;
                habitUpdates.mood = 'tired';
            } else if (state === 'physically_tired') {
                habitUpdates.mood = 'tired';
            } else if (state === 'distracted') {
                habitUpdates.anxiety_level = 5;
            }
        }
        // Direct stress/mood inputs from enhanced check-in
        if (data.stress_level !== undefined) {
            habitUpdates.stress_level = data.stress_level;
        }
        if (data.mood !== undefined) {
            habitUpdates.mood = data.mood;
        }
        if (data.anxiety_level !== undefined) {
            habitUpdates.anxiety_level = data.anxiety_level;
        }
    }
    
    if (type === 'evening') {
        // Evening check-in captures: habits, reflections, lifestyle factors
        if (data.late_caffeine !== undefined) {
            habitUpdates.caffeine_late = data.late_caffeine;
            if (data.late_caffeine) {
                habitUpdates.caffeine_cups = 1; // At least 1 if late caffeine
            }
        }
        if (data.skipped_meals !== undefined) {
            habitUpdates.meals_count = data.skipped_meals ? 2 : 3;
        }
        if (data.alcohol !== undefined) {
            habitUpdates.alcohol_drinks = data.alcohol ? 1 : 0;
        }
        // Enhanced evening check-in fields
        if (data.caffeine_cups !== undefined) {
            habitUpdates.caffeine_cups = data.caffeine_cups;
        }
        if (data.exercise_done !== undefined) {
            habitUpdates.exercise_done = data.exercise_done;
        }
        if (data.exercise_duration !== undefined) {
            habitUpdates.exercise_duration = data.exercise_duration;
        }
        if (data.water_glasses !== undefined) {
            habitUpdates.water_glasses = data.water_glasses;
        }
        if (data.screen_time_hours !== undefined) {
            habitUpdates.screen_time_hours = data.screen_time_hours;
        }
        if (data.screen_before_bed !== undefined) {
            habitUpdates.screen_before_bed = data.screen_before_bed;
        }
        if (data.meditation_done !== undefined) {
            habitUpdates.meditation_done = data.meditation_done;
        }
        if (data.outdoor_time !== undefined) {
            habitUpdates.outdoor_time = data.outdoor_time;
        }
        if (data.junk_food !== undefined) {
            habitUpdates.junk_food = data.junk_food;
        }
        if (data.mood !== undefined) {
            habitUpdates.mood = data.mood;
        }
        if (data.stress_level !== undefined) {
            habitUpdates.stress_level = data.stress_level;
        }
        if (data.sleep_hours !== undefined) {
            habitUpdates.sleep_hours = data.sleep_hours;
        }
        // Drain source can indicate issues
        if (data.drain_source !== undefined) {
            const drain = data.drain_source as string;
            if (drain === 'poor_sleep') {
                habitUpdates.sleep_quality = 'poor';
            } else if (drain === 'emotional') {
                habitUpdates.stress_level = habitUpdates.stress_level || 7;
            }
        }
    }
    
    // Only save if we have habit updates
    if (Object.keys(habitUpdates).length === 0) {
        return;
    }
    
    // Upsert to daily_habits (merge with existing data for the day)
    const { data: existing } = await supabase
        .from('daily_habits')
        .select('*')
        .eq('user_id', userId)
        .eq('date', today)
        .single();
    
    if (existing) {
        // Update existing record
        await supabase
            .from('daily_habits')
            .update(habitUpdates)
            .eq('user_id', userId)
            .eq('date', today);
    } else {
        // Insert new record
        await supabase
            .from('daily_habits')
            .insert({
                user_id: userId,
                date: today,
                ...habitUpdates,
            });
    }
}

// Get check-ins for a date
router.get('/', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { date } = req.query;
        const userId = req.user!.id;

        let query = supabase
            .from('check_ins')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (date) {
            // Filter by date
            const startOfDay = new Date(date as string);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(date as string);
            endOfDay.setHours(23, 59, 59, 999);

            query = query
                .gte('created_at', startOfDay.toISOString())
                .lte('created_at', endOfDay.toISOString());
        }

        const { data, error } = await query;

        if (error) throw error;

        res.json({ success: true, data });
    } catch (error) {
        console.error('Error fetching check-ins:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch check-ins' });
    }
});

// Create a new check-in
router.post('/', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { type, data } = req.body;
        const userId = req.user!.id;

        if (!type || !data) {
            return res.status(400).json({ success: false, error: 'Type and data are required' });
        }

        const validTypes = ['morning', 'midday', 'evening'];
        if (!validTypes.includes(type)) {
            return res.status(400).json({ success: false, error: 'Invalid check-in type' });
        }

        const { data: checkIn, error } = await supabase
            .from('check_ins')
            .insert({
                user_id: userId,
                type,
                data,
            })
            .select()
            .single();

        if (error) throw error;

        // Extract and save habit data from check-in
        try {
            await saveHabitsFromCheckIn(userId, type, data);
            console.log(`✅ Habits extracted from ${type} check-in`);
        } catch (habitError) {
            console.error('Error saving habits from check-in:', habitError);
            // Don't fail the check-in if habit extraction fails
        }

        // Recalculate energy score in real-time after check-in
        const energyResult = await recalculateEnergyScore(userId);

        res.status(201).json({ 
            success: true, 
            data: checkIn,
            energyScore: energyResult ? {
                score: energyResult.score,
                explanation: energyResult.explanation,
                actions: energyResult.actions,
            } : null,
        });
    } catch (error) {
        console.error('Error creating check-in:', error);
        res.status(500).json({ success: false, error: 'Failed to create check-in' });
    }
});

// Get today's check-in status
router.get('/status', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const { data, error } = await supabase
            .from('check_ins')
            .select('type')
            .eq('user_id', userId)
            .gte('created_at', today.toISOString());

        if (error) throw error;

        const completedTypes = data?.map(c => c.type) || [];

        res.json({
            success: true,
            data: {
                morning: completedTypes.includes('morning'),
                midday: completedTypes.includes('midday'),
                evening: completedTypes.includes('evening'),
            },
        });
    } catch (error) {
        console.error('Error fetching check-in status:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch check-in status' });
    }
});

export default router;
