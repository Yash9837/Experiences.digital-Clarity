/**
 * Seed Script: Generate 15 days of realistic dummy data
 * 
 * This creates:
 * - Check-ins (morning, midday, evening) for each day
 * - Energy scores for each day
 * - Health data (sleep, steps, HRV, heart rate, calories, etc.)
 * 
 * Run with: npx ts-node src/scripts/seedDummyData.ts
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Helper to generate random number in range
const rand = (min: number, max: number) => Math.random() * (max - min) + min;
const randInt = (min: number, max: number) => Math.floor(rand(min, max + 1));

// Generate realistic health data
function generateHealthData(dayOffset: number) {
  // Weekends tend to have different patterns
  const date = new Date();
  date.setDate(date.getDate() - dayOffset);
  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
  
  // Sleep: 5-9 hours, weekends slightly more
  const sleepHours = isWeekend ? rand(6.5, 9.5) : rand(5, 8);
  const sleepQuality = sleepHours > 7 ? rand(70, 95) : rand(40, 75);
  
  // Steps: Less on weekends typically, varies widely
  const baseSteps = isWeekend ? randInt(3000, 8000) : randInt(5000, 12000);
  
  // HRV: Higher is better, correlates somewhat with sleep
  const hrv = sleepHours > 7 ? randInt(45, 85) : randInt(25, 55);
  
  // Resting heart rate: Lower is typically better
  const restingHR = randInt(55, 75);
  
  // Active calories
  const activeCalories = Math.round(baseSteps * rand(0.03, 0.05));
  
  // Distance (km) - roughly 0.7m per step
  const distance = baseSteps * 0.0007;
  
  // Flights climbed
  const flightsClimbed = randInt(2, 20);
  
  // Standing hours
  const standingHours = randInt(6, 14);
  
  // Exercise minutes
  const exerciseMinutes = randInt(0, 60);
  
  // Mindful minutes (meditation)
  const mindfulMinutes = Math.random() > 0.6 ? randInt(5, 30) : 0;
  
  // Water intake (glasses)
  const waterGlasses = randInt(4, 12);
  
  // Blood oxygen
  const bloodOxygen = rand(95, 100);
  
  // Respiratory rate
  const respiratoryRate = rand(12, 18);
  
  return {
    sleepDuration: Math.round(sleepHours * 100) / 100,
    sleepQuality: Math.round(sleepQuality),
    deepSleep: Math.round(sleepHours * rand(0.15, 0.25) * 100) / 100,
    remSleep: Math.round(sleepHours * rand(0.2, 0.3) * 100) / 100,
    steps: baseSteps,
    distance: Math.round(distance * 100) / 100,
    flightsClimbed,
    activeCalories,
    restingHeartRate: restingHR,
    hrv,
    standingHours,
    exerciseMinutes,
    mindfulMinutes,
    waterGlasses,
    bloodOxygen: Math.round(bloodOxygen * 10) / 10,
    respiratoryRate: Math.round(respiratoryRate * 10) / 10,
  };
}

// Generate check-in data based on health metrics
function generateCheckIns(healthData: ReturnType<typeof generateHealthData>) {
  const { sleepDuration, sleepQuality } = healthData;
  
  // Morning check-in
  const restedScore = Math.min(10, Math.max(1, Math.round(
    (sleepDuration / 8) * 5 + (sleepQuality / 100) * 5 + rand(-1, 1)
  )));
  
  const motivationLevels = ['low', 'medium', 'high'];
  const motivationIndex = restedScore >= 7 ? 2 : restedScore >= 4 ? 1 : 0;
  const motivation = motivationLevels[Math.max(0, motivationIndex + randInt(-1, 1))];
  
  // Midday check-in
  const energyLevels = ['low', 'ok', 'high'];
  const energyIndex = restedScore >= 7 ? randInt(1, 2) : restedScore >= 4 ? randInt(0, 2) : randInt(0, 1);
  const energyLevel = energyLevels[energyIndex];
  
  const states = ['mentally_drained', 'physically_tired', 'distracted', 'fine'];
  const stateIndex = restedScore >= 6 ? randInt(2, 3) : randInt(0, 2);
  const state = states[stateIndex];
  
  // Evening check-in
  const drainSources = ['poor_sleep', 'work', 'physical', 'emotional', 'poor_meals', 'unknown'];
  const drainSource = sleepDuration < 6 ? 'poor_sleep' : drainSources[randInt(1, 5)];
  
  const comparisons = ['better', 'same', 'worse'];
  const comparisonIndex = restedScore >= 7 ? randInt(0, 1) : restedScore >= 4 ? randInt(0, 2) : randInt(1, 2);
  const dayComparison = comparisons[comparisonIndex];
  
  return {
    morning: {
      rested_score: restedScore,
      motivation_level: motivation,
    },
    midday: {
      energy_level: energyLevel,
      state: state,
    },
    evening: {
      drain_source: drainSource,
      day_vs_expectations: dayComparison,
      late_caffeine: Math.random() > 0.7,
      skipped_meals: Math.random() > 0.8,
      alcohol: Math.random() > 0.85,
    },
  };
}

// Calculate energy score based on all factors
function calculateEnergyScore(
  healthData: ReturnType<typeof generateHealthData>,
  checkIns: ReturnType<typeof generateCheckIns>
): number {
  let score = 5; // Base score
  
  // Sleep impact (±2)
  if (healthData.sleepDuration >= 7.5) score += 1.5;
  else if (healthData.sleepDuration >= 7) score += 1;
  else if (healthData.sleepDuration >= 6) score += 0.5;
  else if (healthData.sleepDuration < 5.5) score -= 1.5;
  else if (healthData.sleepDuration < 6) score -= 1;
  
  // HRV impact (±1)
  if (healthData.hrv >= 60) score += 1;
  else if (healthData.hrv >= 45) score += 0.5;
  else if (healthData.hrv < 30) score -= 0.5;
  
  // Activity impact (±1)
  if (healthData.steps >= 10000) score += 0.8;
  else if (healthData.steps >= 7500) score += 0.5;
  else if (healthData.steps < 3000) score -= 0.5;
  
  // Check-in adjustments (±1.5)
  if (checkIns.morning.rested_score >= 8) score += 0.5;
  else if (checkIns.morning.rested_score <= 3) score -= 0.5;
  
  if (checkIns.midday.energy_level === 'high') score += 0.3;
  else if (checkIns.midday.energy_level === 'low') score -= 0.3;
  
  if (checkIns.evening.day_vs_expectations === 'better') score += 0.3;
  else if (checkIns.evening.day_vs_expectations === 'worse') score -= 0.3;
  
  // Habit penalties
  if (checkIns.evening.late_caffeine) score -= 0.2;
  if (checkIns.evening.skipped_meals) score -= 0.3;
  if (checkIns.evening.alcohol) score -= 0.2;
  
  // Add some randomness
  score += rand(-0.5, 0.5);
  
  // Clamp to 1-10
  return Math.round(Math.min(10, Math.max(1, score)) * 10) / 10;
}

// Generate explanation based on data
function generateExplanation(
  score: number,
  healthData: ReturnType<typeof generateHealthData>,
  checkIns: ReturnType<typeof generateCheckIns>
): string {
  const factors: string[] = [];
  
  if (healthData.sleepDuration >= 7) {
    factors.push(`solid ${healthData.sleepDuration.toFixed(1)} hours of sleep`);
  } else if (healthData.sleepDuration < 6) {
    factors.push(`only ${healthData.sleepDuration.toFixed(1)} hours of sleep`);
  }
  
  if (healthData.hrv >= 55) {
    factors.push('good HRV indicating recovery');
  } else if (healthData.hrv < 35) {
    factors.push('lower HRV suggesting stress');
  }
  
  if (healthData.steps >= 8000) {
    factors.push(`${healthData.steps.toLocaleString()} steps showing great activity`);
  }
  
  if (checkIns.evening.late_caffeine) {
    factors.push('late caffeine intake');
  }
  
  if (score >= 7) {
    return `Your energy is strong today! ${factors.length > 0 ? `Contributing factors include ${factors.slice(0, 2).join(' and ')}.` : ''} Keep up the great habits!`;
  } else if (score >= 5) {
    return `Steady energy levels today. ${factors.length > 0 ? factors[0].charAt(0).toUpperCase() + factors[0].slice(1) + '.' : ''} Consider a short walk or stretch to boost afternoon energy.`;
  } else {
    return `Energy is lower today. ${factors.length > 0 ? `This may be due to ${factors[0]}.` : ''} Prioritize rest and hydration, and consider an early night tonight.`;
  }
}

async function seedData() {
  console.log('🌱 Starting data seed...\n');
  
  // Get users from auth.users via the Supabase admin API
  const { data: authData, error: authError } = await supabase.auth.admin.listUsers();
  
  if (authError || !authData || authData.users.length === 0) {
    console.error('❌ No users found. Please sign up first.');
    console.log('Auth error:', authError);
    process.exit(1);
  }
  
  const userId = authData.users[0].id;
  console.log(`📧 Seeding data for user: ${authData.users[0].email}\n`);
  
  // Clear existing data for clean seed
  console.log('🧹 Clearing existing data...');
  await supabase.from('check_ins').delete().eq('user_id', userId);
  await supabase.from('energy_scores').delete().eq('user_id', userId);
  await supabase.from('health_data').delete().eq('user_id', userId);
  await supabase.from('daily_habits').delete().eq('user_id', userId);
  await supabase.from('habit_patterns').delete().eq('user_id', userId);
  
  const DAYS_TO_SEED = 15;
  
  // Array to store all daily habits for pattern analysis
  const allDailyHabits: any[] = [];
  
  for (let dayOffset = DAYS_TO_SEED; dayOffset >= 0; dayOffset--) {
    const date = new Date();
    date.setDate(date.getDate() - dayOffset);
    const dateStr = date.toISOString().split('T')[0];
    
    console.log(`\n📅 Generating data for ${dateStr}...`);
    
    // Generate health data
    const healthData = generateHealthData(dayOffset);
    console.log(`   💤 Sleep: ${healthData.sleepDuration}h | 👟 Steps: ${healthData.steps} | 💓 HRV: ${healthData.hrv}ms`);
    
    // Generate check-ins
    const checkIns = generateCheckIns(healthData);
    
    // Calculate energy score
    const energyScore = calculateEnergyScore(healthData, checkIns);
    console.log(`   ⚡ Energy Score: ${energyScore}/10`);
    
    // Generate explanation
    const explanation = generateExplanation(energyScore, healthData, checkIns);
    
    // Insert health data as 'sleep' type with all data in JSONB
    const healthRecord = {
      user_id: userId,
      type: 'sleep',  // Use 'sleep' as it's allowed in the constraint
      source_date: dateStr,
      data: {
        // Sleep data
        sleepDuration: healthData.sleepDuration,
        sleepQuality: healthData.sleepQuality,
        deepSleep: healthData.deepSleep,
        remSleep: healthData.remSleep,
        // Activity data (stored together)
        steps: healthData.steps,
        distance: healthData.distance,
        flightsClimbed: healthData.flightsClimbed,
        activeCalories: healthData.activeCalories,
        // Heart data
        restingHeartRate: healthData.restingHeartRate,
        hrv: healthData.hrv,
        // Other metrics
        standingHours: healthData.standingHours,
        exerciseMinutes: healthData.exerciseMinutes,
        mindfulMinutes: healthData.mindfulMinutes,
        bloodOxygen: healthData.bloodOxygen,
        respiratoryRate: healthData.respiratoryRate,
      },
    };
    
    const { error: healthError } = await supabase
      .from('health_data')
      .upsert(healthRecord, { onConflict: 'user_id,type,source_date' });
    
    if (healthError) {
      console.error(`   ❌ Health data error:`, healthError.message);
    }
    
    // Insert check-ins
    const checkInRecords = [
      {
        user_id: userId,
        type: 'morning',
        data: checkIns.morning,
        created_at: new Date(date.setHours(8, randInt(0, 30), 0)).toISOString(),
      },
      {
        user_id: userId,
        type: 'midday',
        data: checkIns.midday,
        created_at: new Date(date.setHours(13, randInt(0, 30), 0)).toISOString(),
      },
      {
        user_id: userId,
        type: 'evening',
        data: checkIns.evening,
        created_at: new Date(date.setHours(20, randInt(0, 45), 0)).toISOString(),
      },
    ];
    
    const { error: checkInError } = await supabase
      .from('check_ins')
      .insert(checkInRecords);
    
    if (checkInError) {
      console.error(`   ❌ Check-in error:`, checkInError.message);
    }
    
    // Insert energy score (without the extra factor columns that may not exist)
    const { error: scoreError } = await supabase
      .from('energy_scores')
      .upsert({
        user_id: userId,
        score: energyScore,
        explanation: explanation,
        actions: [
          { id: '1', title: 'Take a 10-minute walk outside' },
          { id: '2', title: 'Stay hydrated throughout the day' },
          { id: '3', title: 'Consider an earlier bedtime tonight' },
        ],
        date: dateStr,
        created_at: new Date(date.setHours(21, 0, 0)).toISOString(),
      }, { onConflict: 'user_id,date' });
    
    if (scoreError) {
      console.error(`   ❌ Energy score error:`, scoreError.message);
    }
    
    // Insert daily habits
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const hadLateCaffeine = checkIns.evening.late_caffeine;
    const exercised = healthData.exerciseMinutes > 15;
    const screenBeforeBed = Math.random() > 0.4;
    const drankAlcohol = checkIns.evening.alcohol;
    
    const dailyHabitRecord = {
      user_id: userId,
      date: dateStr,
      // Caffeine
      caffeine_cups: randInt(1, 4),
      caffeine_late: hadLateCaffeine,
      caffeine_last_time: hadLateCaffeine ? '16:30:00' : '12:00:00',
      // Sleep
      sleep_hours: healthData.sleepDuration,
      sleep_quality: healthData.sleepQuality >= 80 ? 'excellent' : healthData.sleepQuality >= 60 ? 'good' : healthData.sleepQuality >= 40 ? 'fair' : 'poor',
      woke_on_time: Math.random() > 0.3,
      sleep_felt_complete: healthData.sleepQuality >= 65,
      sleep_interruptions: randInt(0, 3),
      // Alcohol
      alcohol_drinks: drankAlcohol ? randInt(1, 4) : 0,
      alcohol_type: drankAlcohol ? ['beer', 'wine', 'spirits'][randInt(0, 2)] : null,
      // Exercise
      exercise_done: exercised,
      exercise_type: exercised ? ['walking', 'running', 'gym', 'yoga', 'cycling'][randInt(0, 4)] : null,
      exercise_duration: exercised ? healthData.exerciseMinutes : null,
      exercise_intensity: exercised ? ['light', 'moderate', 'intense'][randInt(0, 2)] : null,
      // Meals
      meals_count: randInt(2, 4),
      meals_skipped: checkIns.evening.skipped_meals ? ['breakfast', 'lunch'][randInt(0, 1)] : null,
      meals_quality: ['unhealthy', 'mixed', 'healthy'][randInt(0, 2)],
      water_glasses: healthData.waterGlasses,
      // Screen
      screen_time_hours: rand(3, 8),
      screen_before_bed: screenBeforeBed,
      screen_before_bed_minutes: screenBeforeBed ? randInt(20, 90) : 0,
      social_media_hours: rand(1, 4),
      screen_time_source: 'device',
      // Mental health
      mood: ['low', 'neutral', 'good', 'great'][Math.min(3, Math.max(0, Math.floor(energyScore / 3)))],
      stress_level: Math.round(10 - energyScore + rand(-1, 1)),
      anxiety_level: randInt(2, 7),
      anger_incidents: randInt(0, 3),
      // Social
      social_interaction: ['none', 'minimal', 'moderate', 'lots'][randInt(0, 3)],
      outdoor_time: randInt(0, 120),
      nature_exposure: Math.random() > 0.6,
      // Mindfulness
      meditation_done: healthData.mindfulMinutes > 0,
      meditation_minutes: healthData.mindfulMinutes,
      journaling_done: Math.random() > 0.8,
      gratitude_practiced: Math.random() > 0.7,
      // Work
      work_hours: isWeekend ? 0 : rand(6, 10),
      work_stress: isWeekend ? 'low' : ['low', 'moderate', 'high'][randInt(0, 2)],
      breaks_taken: randInt(1, 5),
      productive_feeling: energyScore >= 6,
      // Negative habits
      smoking: Math.random() > 0.9,
      junk_food: Math.random() > 0.5,
      late_night_eating: Math.random() > 0.6,
    };
    
    allDailyHabits.push(dailyHabitRecord);
    
    const { error: habitError } = await supabase
      .from('daily_habits')
      .upsert(dailyHabitRecord, { onConflict: 'user_id,date' });
    
    if (habitError) {
      console.error(`   ❌ Daily habits error:`, habitError.message);
    } else {
      console.log(`   🧘 Daily habits recorded`);
    }
  }
  
  console.log('\n✅ Data seeding complete!');
  console.log(`   📊 ${DAYS_TO_SEED + 1} days of data created`);
  console.log('   📱 Refresh your app to see the data\n');
  
  // Generate habit pattern summary for the week
  console.log('\n🔍 Generating habit pattern analysis...');
  
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);
  const weekEnd = new Date();
  
  // Calculate averages from daily habits
  const recentHabits = allDailyHabits.slice(-7);
  const avgMood = recentHabits.reduce((acc, h) => {
    const moodMap: Record<string, number> = { 'very_low': 1, 'low': 2, 'neutral': 3, 'good': 4, 'great': 5 };
    return acc + (moodMap[h.mood] || 3);
  }, 0) / recentHabits.length;
  
  const avgStress = recentHabits.reduce((acc, h) => acc + (h.stress_level || 5), 0) / recentHabits.length;
  const avgSleep = recentHabits.reduce((acc, h) => acc + (h.sleep_hours || 7), 0) / recentHabits.length;
  const totalExercise = recentHabits.reduce((acc, h) => acc + (h.exercise_duration || 0), 0);
  
  // Count habit frequencies
  const lateCaffeineCount = recentHabits.filter(h => h.caffeine_late).length;
  const screenBeforeBedCount = recentHabits.filter(h => h.screen_before_bed).length;
  const exerciseCount = recentHabits.filter(h => h.exercise_done).length;
  const lowWaterCount = recentHabits.filter(h => (h.water_glasses || 0) < 5).length;
  const meditationCount = recentHabits.filter(h => h.meditation_done).length;
  const outdoorCount = recentHabits.filter(h => (h.outdoor_time || 0) > 30).length;
  
  const habitPattern = {
    user_id: userId,
    week_start: weekStart.toISOString().split('T')[0],
    week_end: weekEnd.toISOString().split('T')[0],
    worst_habits: [
      { 
        habit: 'Late Caffeine', 
        frequency: lateCaffeineCount / 7, 
        impact: `Affected sleep on ${lateCaffeineCount} nights`,
        icon: '☕',
        severity: lateCaffeineCount >= 4 ? 'high' : 'medium'
      },
      { 
        habit: 'Screen Before Bed', 
        frequency: screenBeforeBedCount / 7, 
        impact: `Used screens late on ${screenBeforeBedCount} nights`,
        icon: '📱',
        severity: screenBeforeBedCount >= 5 ? 'high' : 'medium'
      },
      { 
        habit: 'Low Hydration', 
        frequency: lowWaterCount / 7, 
        impact: `Under-hydrated on ${lowWaterCount} days`,
        icon: '💧',
        severity: lowWaterCount >= 4 ? 'high' : 'medium'
      },
    ].filter(h => h.frequency > 0.2),
    best_habits: [
      { habit: 'Regular Exercise', frequency: exerciseCount / 7, icon: '🏃' },
      { habit: 'Outdoor Time', frequency: outdoorCount / 7, icon: '🌳' },
      { habit: 'Meditation Practice', frequency: meditationCount / 7, icon: '🧘' },
    ].filter(h => h.frequency > 0.2),
    correlations: [
      { trigger: 'Late caffeine', effect: 'Poor sleep quality', strength: 0.72 },
      { trigger: 'Exercise', effect: 'Better mood next day', strength: 0.65 },
      { trigger: 'Screen before bed', effect: 'Lower morning energy', strength: 0.58 },
    ],
    recommendations: [
      { 
        action: 'Switch to decaf after 2pm', 
        reason: `Late caffeine affected your sleep on ${lateCaffeineCount} days`,
        priority: 'high',
        category: 'caffeine',
        icon: '☕',
      },
      { 
        action: 'Put phone away 1 hour before bed', 
        reason: 'Blue light from screens delays sleep onset',
        priority: 'high',
        category: 'screen',
        icon: '📵',
      },
      { 
        action: 'Keep a water bottle at your desk', 
        reason: 'Staying hydrated improves focus and energy',
        priority: 'medium',
        category: 'nutrition',
        icon: '💧',
      },
      { 
        action: 'Take a 15-minute walk today', 
        reason: 'Exercise boosted your mood on active days',
        priority: 'medium',
        category: 'exercise',
        icon: '🚶',
        duration: '15 minutes',
      },
      { 
        action: 'Try 5 minutes of morning meditation', 
        reason: 'Builds mental resilience over time',
        priority: 'low',
        category: 'mindfulness',
        icon: '🧘',
        duration: '5 minutes',
      },
    ],
    avg_mood: Math.round(avgMood * 10) / 10,
    avg_stress: Math.round(avgStress * 10) / 10,
    avg_energy: Math.round((10 - avgStress + avgMood) / 2 * 10) / 10,
    total_exercise_minutes: totalExercise,
    avg_sleep_hours: Math.round(avgSleep * 10) / 10,
    pattern_summary: `Your energy was highest on days with exercise and outdoor time. ${lateCaffeineCount >= 3 ? 'Late caffeine consistently affected your sleep quality. ' : ''}${screenBeforeBedCount >= 4 ? 'Screen use before bed is a pattern to address. ' : ''}Consider establishing consistent sleep and exercise routines for better energy.`,
  };

  const { error: patternError } = await supabase
    .from('habit_patterns')
    .upsert([habitPattern], { onConflict: 'user_id,week_start' });

  if (patternError) {
    console.error('❌ Error inserting habit pattern:', patternError);
  } else {
    console.log('✅ Habit pattern analysis created!');
  }

  console.log('\n🎉 All seeding complete!');
  console.log('\n📋 Summary:');
  console.log(`   • ${DAYS_TO_SEED + 1} days of check-ins, energy scores, and health data`);
  console.log(`   • ${allDailyHabits.length} daily habit records`);
  console.log(`   • 1 weekly habit pattern analysis`);
  console.log(`\n✨ Open the Insights tab to see the patterns!`);
}

// Run the seed
seedData().catch(console.error);
