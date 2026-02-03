import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { supabase } from '../utils/supabase';
import { recalculateEnergyScore } from '../services/energyCalculator';
import crypto from 'crypto';

const router = Router();

/**
 * Generate a hash of check-ins to detect changes
 */
function generateCheckInHash(checkIns: { id: string; type: string; data: unknown }[]): string {
    const content = checkIns
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(c => `${c.id}:${c.type}:${JSON.stringify(c.data)}`)
        .join('|');
    return crypto.createHash('md5').update(content).digest('hex').substring(0, 16);
}

// Get energy score for a date
router.get('/', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { date } = req.query;
        const userId = req.user!.id;
        const targetDate = date ? new Date(date as string) : new Date();
        const dateStr = targetDate.toISOString().split('T')[0];

        // Get today's check-ins first to compute hash
        const startOfDay = new Date(dateStr);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(dateStr);
        endOfDay.setHours(23, 59, 59, 999);

        const { data: checkIns, error: checkInError } = await supabase
            .from('check_ins')
            .select('id, type, data')
            .eq('user_id', userId)
            .gte('created_at', startOfDay.toISOString())
            .lte('created_at', endOfDay.toISOString());

        if (checkInError) throw checkInError;

        if (!checkIns || checkIns.length === 0) {
            return res.json({
                success: true,
                data: null,
                message: 'No check-ins found for this date',
            });
        }

        // Generate hash of current check-ins
        const currentHash = generateCheckInHash(checkIns);

        // Check if we have a cached energy score
        const { data: existingScore } = await supabase
            .from('energy_scores')
            .select('*')
            .eq('user_id', userId)
            .eq('date', dateStr)
            .single();

        // Check if cache is valid:
        // 1. Score exists
        // 2. Has AI-generated actions (with reason field)
        // 3. Hash matches current check-ins (no new check-ins since last calculation)
        if (existingScore) {
            const cachedHash = existingScore.check_in_hash;
            const hasReasons = existingScore.actions?.some((a: { reason?: string }) => a.reason && a.reason.length > 0);
            
            if (cachedHash === currentHash && hasReasons) {
                console.log('✅ Using cached energy score (hash match)');
                return res.json({ success: true, data: existingScore, cached: true });
            } else {
                console.log('🔄 Cache invalidated - check-ins changed or missing reasons, regenerating...');
            }
        }

        // Calculate fresh score with AI
        const result = await recalculateEnergyScore(userId, dateStr, currentHash);

        if (!result) {
            return res.json({
                success: true,
                data: null,
                message: 'Could not calculate energy score',
            });
        }

        // Fetch the saved score to return
        const { data: savedScore } = await supabase
            .from('energy_scores')
            .select('*')
            .eq('user_id', userId)
            .eq('date', dateStr)
            .single();

        res.json({ success: true, data: savedScore, cached: false });
    } catch (error) {
        console.error('Error fetching energy score:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch energy score' });
    }
});

// Force regenerate energy score for today
router.post('/regenerate', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const today = new Date().toISOString().split('T')[0];

        // Delete existing score for today to force fresh calculation
        await supabase
            .from('energy_scores')
            .delete()
            .eq('user_id', userId)
            .eq('date', today);

        // Use the new real-time calculator
        const result = await recalculateEnergyScore(userId, today);

        if (!result) {
            return res.json({
                success: true,
                data: null,
                message: 'No data available to calculate energy score',
            });
        }

        // Fetch the saved score to return
        const { data: savedScore } = await supabase
            .from('energy_scores')
            .select('*')
            .eq('user_id', userId)
            .eq('date', today)
            .single();

        res.json({ success: true, data: savedScore });
    } catch (error) {
        console.error('Error regenerating energy score:', error);
        res.status(500).json({ success: false, error: 'Failed to regenerate energy score' });
    }
});

export default router;
