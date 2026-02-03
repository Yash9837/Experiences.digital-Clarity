import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { supabase } from '../utils/supabase';

const router = Router();

// Get user profile
router.get('/profile', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user!.id;

        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();

        if (error && error.code !== 'PGRST116') throw error;

        if (!data) {
            // Create default profile
            const { data: newUser, error: createError } = await supabase
                .from('users')
                .insert({
                    id: userId,
                    onboarding_completed: false,
                    notification_preferences: {
                        morning_checkin: true,
                        midday_pulse: true,
                        evening_reflection: true,
                        weekly_insights: true,
                    },
                })
                .select()
                .single();

            if (createError) throw createError;
            return res.json({ success: true, data: newUser });
        }

        res.json({ success: true, data });
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch profile' });
    }
});

// Update user profile
router.put('/profile', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const { notification_preferences } = req.body;

        const updates: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
        };

        if (notification_preferences) {
            updates.notification_preferences = notification_preferences;
        }

        const { data, error } = await supabase
            .from('users')
            .update(updates)
            .eq('id', userId)
            .select()
            .single();

        if (error) throw error;

        res.json({ success: true, data });
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ success: false, error: 'Failed to update profile' });
    }
});

// Complete onboarding
router.post('/onboarding', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user!.id;

        const { data, error } = await supabase
            .from('users')
            .update({
                onboarding_completed: true,
                updated_at: new Date().toISOString(),
            })
            .eq('id', userId)
            .select()
            .single();

        if (error) throw error;

        res.json({ success: true, data });
    } catch (error) {
        console.error('Error completing onboarding:', error);
        res.status(500).json({ success: false, error: 'Failed to complete onboarding' });
    }
});

export default router;
