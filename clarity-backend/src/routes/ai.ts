import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { chat, generateHealthInsights, generateWeeklySummary, ChatMessage, HealthContext } from '../services/gemini';
import { supabase } from '../utils/supabase';

const router = Router();

// Chat with AI health copilot
router.post('/chat', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { message, history = [] } = req.body as { 
            message: string; 
            history: ChatMessage[] 
        };

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // Get user's recent health context
        const healthContext = await getUserHealthContext(userId);

        // Generate AI response
        const response = await chat(message, history, healthContext || undefined);

        // Store conversation in database for analytics (optional)
        try {
            await supabase.from('ai_conversations').insert({
                user_id: userId,
                message,
                response,
                created_at: new Date().toISOString(),
            });
        } catch {
            // Table might not exist yet, that's okay
            console.log('AI conversation logging skipped');
        }

        res.json({ 
            response,
            healthContext: healthContext ? {
                energyScore: healthContext.energyScore,
                sleepDuration: healthContext.sleepDuration,
            } : null
        });
    } catch (error) {
        console.error('AI chat error:', error);
        
        // Provide a helpful fallback response when AI is unavailable
        const fallbackResponses = [
            "I'm a bit overwhelmed right now 😅 Give me a moment and try again!",
            "Taking a quick breather - can you ask me again in a sec?",
            "Oops, my brain needs a quick reset. Try again in a moment!",
            "I'm thinking extra hard right now... try again shortly! 🤔",
        ];
        const fallback = fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
        
        res.json({ 
            response: fallback,
            isTemporary: true 
        });
    }
});

// Get AI-generated health insights
router.get('/insights', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const healthContext = await getUserHealthContext(userId);

        if (!healthContext) {
            return res.json({ 
                insights: "I don't have enough data yet to provide personalized insights. Complete a few check-ins and sync your health data to get started!" 
            });
        }

        const insights = await generateHealthInsights(healthContext);

        res.json({ insights, healthContext });
    } catch (error) {
        console.error('AI insights error:', error);
        res.status(500).json({ error: 'Failed to generate insights' });
    }
});

// Get weekly AI summary
router.get('/weekly-summary', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // Get last 7 days of data
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const startDate = sevenDaysAgo.toISOString().split('T')[0];

        // Fetch energy scores
        const { data: energyScores } = await supabase
            .from('energy_scores')
            .select('score, date')
            .eq('user_id', userId)
            .gte('date', startDate)
            .order('date', { ascending: true });

        // Fetch health data
        const { data: healthData } = await supabase
            .from('health_data')
            .select('type, data, source_date')
            .eq('user_id', userId)
            .gte('source_date', startDate);

        if (!energyScores || energyScores.length < 3) {
            return res.json({
                summary: "Keep tracking for a few more days and I'll be able to provide meaningful weekly insights! You're building great habits."
            });
        }

        // Calculate weekly stats
        const avgEnergy = energyScores.reduce((sum, e) => sum + e.score, 0) / energyScores.length;
        const bestDay = energyScores.reduce((best, curr) => curr.score > best.score ? curr : best);
        const worstDay = energyScores.reduce((worst, curr) => curr.score < worst.score ? curr : worst);

        // Get sleep data
        const sleepRecords = healthData?.filter(h => h.type === 'sleep') || [];
        const avgSleep = sleepRecords.length > 0
            ? sleepRecords.reduce((sum, s) => {
                const data = s.data as { sleepDuration?: number; duration_hours?: number };
                return sum + (data.sleepDuration || data.duration_hours || 0);
            }, 0) / sleepRecords.length
            : 0;

        // Get steps data
        const stepsData = sleepRecords.map(s => {
            const data = s.data as { steps?: number };
            return data.steps || 0;
        });
        const avgSteps = stepsData.length > 0
            ? stepsData.reduce((sum, s) => sum + s, 0) / stepsData.length
            : 0;

        const summary = await generateWeeklySummary({
            avgSleep,
            avgSteps,
            avgEnergy,
            bestDay: new Date(bestDay.date).toLocaleDateString('en-US', { weekday: 'long' }),
            worstDay: new Date(worstDay.date).toLocaleDateString('en-US', { weekday: 'long' }),
        });

        res.json({
            summary,
            stats: {
                avgEnergy: avgEnergy.toFixed(1),
                avgSleep: avgSleep.toFixed(1),
                avgSteps: Math.round(avgSteps),
                daysTracked: energyScores.length,
            }
        });
    } catch (error) {
        console.error('Weekly summary error:', error);
        res.status(500).json({ error: 'Failed to generate weekly summary' });
    }
});

// Helper function to get user's health context
async function getUserHealthContext(userId: string): Promise<HealthContext | null> {
    try {
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const dateStr = yesterday.toISOString().split('T')[0];

        // Get health data
        const { data: healthRecord } = await supabase
            .from('health_data')
            .select('data')
            .eq('user_id', userId)
            .eq('type', 'sleep')
            .eq('source_date', dateStr)
            .single();

        // Get today's energy score
        const { data: energyScore } = await supabase
            .from('energy_scores')
            .select('score')
            .eq('user_id', userId)
            .eq('date', today.toISOString().split('T')[0])
            .single();

        // Get today's check-ins
        const startOfDay = new Date(today);
        startOfDay.setHours(0, 0, 0, 0);
        
        const { data: checkIns } = await supabase
            .from('check_ins')
            .select('type, data')
            .eq('user_id', userId)
            .gte('created_at', startOfDay.toISOString());

        if (!healthRecord && !energyScore && !checkIns?.length) {
            return null;
        }

        const healthData = healthRecord?.data as Record<string, unknown> || {};
        
        const context: HealthContext = {
            sleepDuration: healthData.sleepDuration as number,
            sleepQuality: healthData.sleepQuality as number,
            steps: healthData.steps as number,
            hrv: healthData.hrv as number,
            restingHeartRate: healthData.restingHeartRate as number,
            activeCalories: healthData.activeCalories as number,
            energyScore: energyScore?.score,
        };

        // Add check-in context
        if (checkIns && checkIns.length > 0) {
            context.checkIns = {};
            for (const checkIn of checkIns) {
                const data = checkIn.data as Record<string, unknown>;
                if (checkIn.type === 'morning') {
                    context.checkIns.morning = {
                        restedScore: data.rested_score as number,
                        motivationLevel: data.motivation_level as string,
                    };
                } else if (checkIn.type === 'midday') {
                    context.checkIns.midday = {
                        energyLevel: data.energy_level as string,
                        state: data.state as string,
                    };
                } else if (checkIn.type === 'evening') {
                    context.checkIns.evening = {
                        drainSource: data.drain_source as string,
                        dayVsExpectations: data.day_vs_expectations as string,
                    };
                }
            }
        }

        return context;
    } catch (error) {
        console.error('Error getting health context:', error);
        return null;
    }
}

export default router;
