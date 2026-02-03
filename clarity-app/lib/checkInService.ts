import { supabase } from '@/lib/supabase';

// Energy score result returned after check-in
export interface EnergyScoreResult {
    score: number;
    explanation: string;
    actions: { id: string; title: string }[];
}

/**
 * Ensures a user record exists in the users table.
 * This is needed because check_ins has a foreign key to users.
 */
export async function ensureUserExists(userId: string): Promise<boolean> {
    try {
        // Check if user exists
        const { data: existingUser, error: selectError } = await supabase
            .from('users')
            .select('id')
            .eq('id', userId)
            .single();

        if (existingUser) {
            return true;
        }

        // Create the user record if it doesn't exist
        const { error: insertError } = await supabase
            .from('users')
            .insert({ id: userId });

        if (insertError) {
            console.log('Note: Could not create user record:', insertError.message);
            // Still return true - the insert might fail due to RLS but the user might exist
            return true;
        }

        return true;
    } catch (err) {
        console.error('ensureUserExists error:', err);
        return false;
    }
}

/**
 * Save a check-in to the database
 * Returns the updated energy score if available
 */
export async function saveCheckIn(
    type: 'morning' | 'midday' | 'evening',
    data: Record<string, unknown>
): Promise<{ success: boolean; error?: string; energyScore?: EnergyScoreResult }> {
    try {
        // Get current user
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            console.error('Auth error:', authError);
            return { success: false, error: 'Please log in to save your check-in' };
        }

        console.log(`📝 Saving ${type} check-in for user:`, user.id);

        // Ensure user record exists
        await ensureUserExists(user.id);

        // Insert the check-in
        const { error: insertError } = await supabase.from('check_ins').insert({
            user_id: user.id,
            type,
            data,
        });

        if (insertError) {
            console.error('Insert error:', insertError);
            return { success: false, error: insertError.message };
        }

        console.log(`✅ ${type} check-in saved successfully!`);
        
        // Trigger real-time energy recalculation
        const energyScore = await recalculateEnergy();

        return { success: true, energyScore };
    } catch (err) {
        console.error('saveCheckIn error:', err);
        return { success: false, error: 'Something went wrong. Please try again.' };
    }
}

/**
 * Recalculate energy score based on current check-ins
 */
export async function recalculateEnergy(): Promise<EnergyScoreResult | undefined> {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session?.access_token) {
            console.log('No session for energy recalculation');
            return undefined;
        }

        // Call the regenerate endpoint to get fresh energy score
        const API_URL = __DEV__ 
            ? 'http://localhost:3000' 
            : 'https://your-production-api.com';

        const response = await fetch(`${API_URL}/api/energy/regenerate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
            },
        });

        if (!response.ok) {
            console.log('Energy recalculation failed:', response.status);
            return undefined;
        }

        const result = await response.json();
        
        if (result.success && result.data) {
            console.log(`⚡ Energy score updated: ${result.data.score}/10`);
            return {
                score: result.data.score,
                explanation: result.data.explanation,
                actions: result.data.actions || [],
            };
        }

        return undefined;
    } catch (err) {
        console.error('recalculateEnergy error:', err);
        return undefined;
    }
}
