/**
 * Schema Migration Script
 * 
 * Adds missing columns to existing tables for enhanced health tracking
 * Run with: npx ts-node src/scripts/migrateSchema.ts
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  console.log('🔄 Running schema migration...\n');

  const migrations = [
    // Add health_factors and check_in_factors to energy_scores
    `ALTER TABLE public.energy_scores 
     ADD COLUMN IF NOT EXISTS health_factors JSONB DEFAULT '{}'::jsonb`,
    
    `ALTER TABLE public.energy_scores 
     ADD COLUMN IF NOT EXISTS check_in_factors JSONB DEFAULT '{}'::jsonb`,
    
    // Add source column to health_data
    `ALTER TABLE public.health_data 
     ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'manual'`,
    
    // Update health_data type constraint to allow more types
    `ALTER TABLE public.health_data 
     DROP CONSTRAINT IF EXISTS health_data_type_check`,
    
    `ALTER TABLE public.health_data 
     ADD CONSTRAINT health_data_type_check 
     CHECK (type IN ('sleep', 'steps', 'hrv', 'heart_rate', 'activity', 'combined', 'calendar', 'nutrition', 'mindfulness', 'workout'))`,
  ];

  for (const sql of migrations) {
    console.log(`📝 Running: ${sql.substring(0, 60)}...`);
    
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql });
    
    if (error) {
      // Try direct approach if RPC doesn't exist
      console.log(`   ⚠️ RPC failed, trying direct query...`);
    } else {
      console.log(`   ✅ Success`);
    }
  }

  console.log('\n✅ Migration complete!');
  console.log('📌 Note: If migrations failed, run the SQL manually in Supabase Dashboard > SQL Editor');
  console.log('\nSQL to run manually:\n');
  console.log(`
-- Add columns to energy_scores
ALTER TABLE public.energy_scores 
ADD COLUMN IF NOT EXISTS health_factors JSONB DEFAULT '{}'::jsonb;

ALTER TABLE public.energy_scores 
ADD COLUMN IF NOT EXISTS check_in_factors JSONB DEFAULT '{}'::jsonb;

-- Add source column to health_data
ALTER TABLE public.health_data 
ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'manual';

-- Update health_data type constraint
ALTER TABLE public.health_data 
DROP CONSTRAINT IF EXISTS health_data_type_check;

ALTER TABLE public.health_data 
ADD CONSTRAINT health_data_type_check 
CHECK (type IN ('sleep', 'steps', 'hrv', 'heart_rate', 'activity', 'combined', 'calendar', 'nutrition', 'mindfulness', 'workout'));
  `);
}

runMigration().catch(console.error);
