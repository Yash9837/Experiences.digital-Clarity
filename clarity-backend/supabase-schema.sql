-- Clarity App Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (extends auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  notification_preferences JSONB DEFAULT '{
    "morning_checkin": true,
    "midday_pulse": true,
    "evening_reflection": true,
    "weekly_insights": true
  }'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Check-ins table
CREATE TABLE IF NOT EXISTS public.check_ins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('morning', 'midday', 'evening')),
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Energy scores table (enhanced with factor tracking and caching)
CREATE TABLE IF NOT EXISTS public.energy_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  score DECIMAL(3,1) NOT NULL CHECK (score >= 1 AND score <= 10),
  explanation TEXT NOT NULL,
  actions JSONB DEFAULT '[]'::jsonb,
  health_factors JSONB DEFAULT '{}'::jsonb,
  check_in_factors JSONB DEFAULT '{}'::jsonb,
  check_in_hash VARCHAR(16),  -- Hash of check-ins for cache validation
  date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- Health data table (enhanced with source tracking and more types)
CREATE TABLE IF NOT EXISTS public.health_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL CHECK (type IN ('sleep', 'steps', 'hrv', 'heart_rate', 'activity', 'combined', 'calendar', 'nutrition', 'mindfulness', 'workout')),
  source VARCHAR(50) DEFAULT 'manual',
  data JSONB NOT NULL,
  source_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, type, source_date)
);

-- Explanation feedback table
CREATE TABLE IF NOT EXISTS public.explanation_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  energy_score_id UUID NOT NULL REFERENCES public.energy_scores(id) ON DELETE CASCADE,
  matched BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Weekly insights table (Phase 2)
CREATE TABLE IF NOT EXISTS public.weekly_insights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  top_drains JSONB DEFAULT '[]'::jsonb,
  top_supports JSONB DEFAULT '[]'::jsonb,
  experiment_suggestion TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, week_start)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_check_ins_user_date ON public.check_ins(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_energy_scores_user_date ON public.energy_scores(user_id, date);
CREATE INDEX IF NOT EXISTS idx_health_data_user_date ON public.health_data(user_id, source_date);
CREATE INDEX IF NOT EXISTS idx_feedback_user ON public.explanation_feedback(user_id);

-- Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.energy_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.explanation_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_insights ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own data
CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT USING (auth.uid() = id);
  
CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can manage own check_ins" ON public.check_ins
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own energy_scores" ON public.energy_scores
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own health_data" ON public.health_data
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own feedback" ON public.explanation_feedback
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own weekly_insights" ON public.weekly_insights
  FOR ALL USING (auth.uid() = user_id);

-- Function to auto-create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create user profile on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- DAILY HABITS TABLE - Mental & Physical Health Tracking
-- =====================================================

CREATE TABLE IF NOT EXISTS public.daily_habits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  
  -- Caffeine tracking
  caffeine_cups INTEGER DEFAULT 0,          -- Number of cups/servings
  caffeine_last_time TIME,                  -- Last caffeine intake time
  caffeine_late BOOLEAN DEFAULT FALSE,      -- After 2pm = late
  
  -- Sleep tracking
  sleep_hours DECIMAL(3,1),                 -- Hours slept
  sleep_quality VARCHAR(20) CHECK (sleep_quality IN ('poor', 'fair', 'good', 'excellent')),
  sleep_time TIME,                          -- Bedtime
  wake_time TIME,                           -- Wake time
  naps_taken INTEGER DEFAULT 0,             -- Number of naps
  woke_on_time BOOLEAN,                     -- Did user wake up at intended time?
  sleep_felt_complete BOOLEAN,              -- Did sleep feel fully restorative?
  sleep_interruptions INTEGER DEFAULT 0,    -- Number of times woken during night
  
  -- Alcohol tracking
  alcohol_drinks INTEGER DEFAULT 0,         -- Number of drinks
  alcohol_type VARCHAR(50),                 -- Beer, wine, spirits, etc.
  
  -- Exercise tracking
  exercise_done BOOLEAN DEFAULT FALSE,
  exercise_type VARCHAR(50),                -- Walking, running, gym, yoga, etc.
  exercise_duration INTEGER,                -- Minutes
  exercise_intensity VARCHAR(20) CHECK (exercise_intensity IN ('light', 'moderate', 'intense')),
  
  -- Meals tracking
  meals_count INTEGER DEFAULT 0,            -- Number of meals eaten
  meals_skipped VARCHAR(50),                -- breakfast, lunch, dinner
  meals_quality VARCHAR(20) CHECK (meals_quality IN ('unhealthy', 'mixed', 'healthy')),
  water_glasses INTEGER DEFAULT 0,          -- Glasses of water
  
  -- Screen time (from device API - iOS ScreenTime / Android Digital Wellbeing)
  screen_time_hours DECIMAL(3,1),           -- Total screen hours (from device)
  screen_before_bed BOOLEAN DEFAULT FALSE,  -- Screen within 1hr of sleep (from device)
  screen_before_bed_minutes INTEGER,        -- Minutes of screen use before bed (from device)
  social_media_hours DECIMAL(3,1),          -- Social media specifically (from device)
  screen_time_source VARCHAR(20) DEFAULT 'device' CHECK (screen_time_source IN ('device', 'manual', 'estimated')),
  
  -- Mental health indicators
  mood VARCHAR(20) CHECK (mood IN ('very_low', 'low', 'neutral', 'good', 'great')),
  stress_level INTEGER CHECK (stress_level >= 1 AND stress_level <= 10),
  anxiety_level INTEGER CHECK (anxiety_level >= 1 AND anxiety_level <= 10),
  anger_incidents INTEGER DEFAULT 0,        -- Times felt angry/irritated
  
  -- Social & Environment
  social_interaction VARCHAR(20) CHECK (social_interaction IN ('none', 'minimal', 'moderate', 'lots')),
  outdoor_time INTEGER DEFAULT 0,           -- Minutes spent outdoors
  nature_exposure BOOLEAN DEFAULT FALSE,    -- Time in nature/park
  
  -- Mindfulness & Recovery
  meditation_done BOOLEAN DEFAULT FALSE,
  meditation_minutes INTEGER DEFAULT 0,
  journaling_done BOOLEAN DEFAULT FALSE,
  gratitude_practiced BOOLEAN DEFAULT FALSE,
  
  -- Work & Productivity
  work_hours DECIMAL(3,1),                  -- Hours worked
  work_stress VARCHAR(20) CHECK (work_stress IN ('low', 'moderate', 'high', 'extreme')),
  breaks_taken INTEGER DEFAULT 0,           -- Number of breaks
  productive_feeling BOOLEAN DEFAULT FALSE,
  
  -- Negative habits
  smoking BOOLEAN DEFAULT FALSE,
  junk_food BOOLEAN DEFAULT FALSE,
  late_night_eating BOOLEAN DEFAULT FALSE,  -- Eating after 9pm
  
  -- Custom notes
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- Index for habit queries
CREATE INDEX IF NOT EXISTS idx_daily_habits_user_date ON public.daily_habits(user_id, date);

-- RLS for daily_habits
ALTER TABLE public.daily_habits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own daily_habits" ON public.daily_habits
  FOR ALL USING (auth.uid() = user_id);

-- =====================================================
-- HABIT PATTERNS TABLE - Weekly Pattern Analysis Storage
-- =====================================================

CREATE TABLE IF NOT EXISTS public.habit_patterns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  
  -- Identified patterns
  worst_habits JSONB DEFAULT '[]'::jsonb,     -- Array of {habit, frequency, impact}
  best_habits JSONB DEFAULT '[]'::jsonb,      -- Array of {habit, frequency, impact}
  
  -- Correlations found
  correlations JSONB DEFAULT '[]'::jsonb,     -- Array of {trigger, effect, strength}
  
  -- Recommendations
  recommendations JSONB DEFAULT '[]'::jsonb,  -- Array of {action, reason, priority}
  
  -- Stats
  avg_mood DECIMAL(3,1),
  avg_stress DECIMAL(3,1),
  avg_energy DECIMAL(3,1),
  total_exercise_minutes INTEGER,
  avg_sleep_hours DECIMAL(3,1),
  
  -- AI-generated summary
  pattern_summary TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, week_start)
);

-- Index for pattern queries
CREATE INDEX IF NOT EXISTS idx_habit_patterns_user_week ON public.habit_patterns(user_id, week_start);

-- RLS for habit_patterns
ALTER TABLE public.habit_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own habit_patterns" ON public.habit_patterns
  FOR ALL USING (auth.uid() = user_id);
