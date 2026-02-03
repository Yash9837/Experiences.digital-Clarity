import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { supabase } from '../utils/supabase';

const router = Router();

// Submit feedback for an energy score explanation
router.post('/', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { energy_score_id, matched } = req.body;
        const userId = req.user!.id;

        if (!energy_score_id || typeof matched !== 'boolean') {
            return res.status(400).json({
                success: false,
                error: 'energy_score_id and matched (boolean) are required',
            });
        }

        // Verify the energy score belongs to the user
        const { data: score, error: verifyError } = await supabase
            .from('energy_scores')
            .select('id')
            .eq('id', energy_score_id)
            .eq('user_id', userId)
            .single();

        if (verifyError || !score) {
            return res.status(404).json({ success: false, error: 'Energy score not found' });
        }

        const { data: feedback, error } = await supabase
            .from('explanation_feedback')
            .insert({
                user_id: userId,
                energy_score_id,
                matched,
            })
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({ success: true, data: feedback });
    } catch (error) {
        console.error('Error submitting feedback:', error);
        res.status(500).json({ success: false, error: 'Failed to submit feedback' });
    }
});

// Get feedback stats for model calibration
router.get('/stats', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user!.id;

        const { data, error } = await supabase
            .from('explanation_feedback')
            .select('matched')
            .eq('user_id', userId);

        if (error) throw error;

        const total = data?.length || 0;
        const matched = data?.filter(f => f.matched).length || 0;
        const matchRate = total > 0 ? (matched / total) * 100 : 0;

        res.json({
            success: true,
            data: {
                total,
                matched,
                matchRate: Math.round(matchRate * 10) / 10,
            },
        });
    } catch (error) {
        console.error('Error fetching feedback stats:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch feedback stats' });
    }
});

export default router;
