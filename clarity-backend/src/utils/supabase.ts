import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables first
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

let supabase: SupabaseClient;

if (!supabaseUrl || !supabaseServiceKey) {
    console.warn('⚠️ Supabase credentials not configured. Some features may not work.');
    // Create a dummy client that will fail gracefully
    supabase = createClient('https://placeholder.supabase.co', 'placeholder-key', {
        auth: { autoRefreshToken: false, persistSession: false },
    });
} else {
    console.log('✅ Supabase connected to:', supabaseUrl);
    supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}

export { supabase };
export default supabase;
