import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { supabase } from '../utils/supabase';

const router = Router();

// Sync health data from device
router.post('/', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { type, data, source_date } = req.body;
        const userId = req.user!.id;

        if (!type || !data || !source_date) {
            return res.status(400).json({
                success: false,
                error: 'type, data, and source_date are required',
            });
        }

        const validTypes = ['sleep', 'steps', 'calendar'];
        if (!validTypes.includes(type)) {
            return res.status(400).json({ success: false, error: 'Invalid health data type' });
        }

        // Upsert - replace if exists for same date and type
        const { data: existing } = await supabase
            .from('health_data')
            .select('id')
            .eq('user_id', userId)
            .eq('type', type)
            .eq('source_date', source_date)
            .single();

        let result;
        if (existing) {
            const { data: updated, error } = await supabase
                .from('health_data')
                .update({ data })
                .eq('id', existing.id)
                .select()
                .single();
            if (error) throw error;
            result = updated;
        } else {
            const { data: created, error } = await supabase
                .from('health_data')
                .insert({
                    user_id: userId,
                    type,
                    data,
                    source_date,
                })
                .select()
                .single();
            if (error) throw error;
            result = created;
        }

        res.status(201).json({ success: true, data: result });
    } catch (error) {
        console.error('Error syncing health data:', error);
        res.status(500).json({ success: false, error: 'Failed to sync health data' });
    }
});

// Get health data for a date range
router.get('/', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { start_date, end_date, type } = req.query;
        const userId = req.user!.id;

        let query = supabase
            .from('health_data')
            .select('*')
            .eq('user_id', userId)
            .order('source_date', { ascending: false });

        if (type) {
            query = query.eq('type', type as string);
        }

        if (start_date) {
            query = query.gte('source_date', start_date as string);
        }

        if (end_date) {
            query = query.lte('source_date', end_date as string);
        }

        const { data, error } = await query;

        if (error) throw error;

        res.json({ success: true, data });
    } catch (error) {
        console.error('Error fetching health data:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch health data' });
    }
});

export default router;
