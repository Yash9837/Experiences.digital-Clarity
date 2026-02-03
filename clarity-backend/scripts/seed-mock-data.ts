import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
);

// Generate dates for last 10 days
function getLastNDays(n: number): string[] {
    const dates: string[] = [];
    for (let i = 0; i < n; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        dates.push(date.toISOString().split('T')[0]);
    }
    return dates;
}

async function seedMockData() {
    console.log('🌱 Starting to seed mock data...\n');

    // First, get a user to seed data for
    const { data: users } = await supabase.from('users').select('id').limit(1);

    if (!users || users.length === 0) {
        console.log('❌ No users found. Please sign up first.');
        return;
    }

    const userId = users[0].id;
    console.log(`📌 Seeding data for user: ${userId}\n`);

    const dates = getLastNDays(10);

    // Mock daily habits data - realistic patterns
    const habitPatterns = [
        // Day 0 (today) - Good day
        { caffeine_cups: 2, caffeine_late: false, sleep_hours: 7.5, sleep_quality: 'good', exercise_done: true, exercise_duration: 30, mood: 'good', stress_level: 4, water_glasses: 8, meals_count: 3 },
        // Day 1 - Late caffeine day
        { caffeine_cups: 4, caffeine_late: true, sleep_hours: 6.0, sleep_quality: 'poor', exercise_done: false, mood: 'low', stress_level: 7, water_glasses: 5, meals_count: 2, skipped_meals: 'breakfast' },
        // Day 2 - Great day with exercise
        { caffeine_cups: 2, caffeine_late: false, sleep_hours: 8.0, sleep_quality: 'excellent', exercise_done: true, exercise_duration: 45, exercise_type: 'running', mood: 'great', stress_level: 3, outdoor_time: 60, water_glasses: 10, meals_count: 3 },
        // Day 3 - Stressful day
        { caffeine_cups: 5, caffeine_late: true, sleep_hours: 5.5, sleep_quality: 'poor', exercise_done: false, mood: 'very_low', stress_level: 9, anxiety_level: 8, water_glasses: 4, meals_count: 2, alcohol_drinks: 2 },
        // Day 4 - Okay day
        { caffeine_cups: 3, caffeine_late: false, sleep_hours: 7.0, sleep_quality: 'fair', exercise_done: true, exercise_duration: 20, mood: 'neutral', stress_level: 5, water_glasses: 6, meals_count: 3 },
        // Day 5 - Late caffeine again
        { caffeine_cups: 4, caffeine_late: true, sleep_hours: 6.5, sleep_quality: 'fair', exercise_done: false, mood: 'low', stress_level: 6, water_glasses: 5, meals_count: 3 },
        // Day 6 - Good recovery day
        { caffeine_cups: 2, caffeine_late: false, sleep_hours: 8.5, sleep_quality: 'excellent', exercise_done: true, exercise_duration: 40, exercise_type: 'yoga', meditation_done: true, meditation_minutes: 15, mood: 'great', stress_level: 2, outdoor_time: 45, water_glasses: 8, meals_count: 3 },
        // Day 7 - Weekend chill
        { caffeine_cups: 1, caffeine_late: false, sleep_hours: 9.0, sleep_quality: 'excellent', exercise_done: true, exercise_duration: 60, exercise_type: 'hiking', mood: 'great', stress_level: 2, outdoor_time: 120, water_glasses: 9, meals_count: 3, social_interaction: 'lots' },
        // Day 8 - Late caffeine day
        { caffeine_cups: 3, caffeine_late: true, sleep_hours: 6.0, sleep_quality: 'poor', exercise_done: false, mood: 'neutral', stress_level: 6, water_glasses: 6, meals_count: 2, late_night_eating: true },
        // Day 9 - Average day
        { caffeine_cups: 2, caffeine_late: false, sleep_hours: 7.0, sleep_quality: 'good', exercise_done: false, mood: 'neutral', stress_level: 5, water_glasses: 7, meals_count: 3 },
    ];

    // Insert daily habits
    console.log('📊 Inserting daily habits...');
    for (let i = 0; i < dates.length; i++) {
        const date = dates[i];
        const habits = habitPatterns[i] || habitPatterns[0];

        const { error } = await supabase
            .from('daily_habits')
            .upsert({
                user_id: userId,
                date: date,
                ...habits,
            }, { onConflict: 'user_id,date' });

        if (error) {
            console.log(`  ⚠️ Error on ${date}:`, error.message);
        } else {
            console.log(`  ✅ ${date}: ${habits.mood} mood, ${habits.caffeine_cups} coffees${habits.caffeine_late ? ' (late!)' : ''}`);
        }
    }

    // Insert check-ins
    console.log('\n📝 Inserting check-ins...');
    for (let i = 0; i < dates.length; i++) {
        const date = dates[i];
        const habits = habitPatterns[i] || habitPatterns[0];

        // Morning check-in
        const morningData = {
            rested_score: habits.sleep_quality === 'excellent' ? 9 : habits.sleep_quality === 'good' ? 7 : habits.sleep_quality === 'fair' ? 5 : 3,
            sleep_quality: habits.sleep_quality,
            motivation_level: habits.mood === 'great' ? 'high' : habits.mood === 'good' ? 'moderate' : 'low',
            woke_on_time: habits.sleep_quality !== 'poor',
        };

        await supabase.from('check_ins').upsert({
            user_id: userId,
            type: 'morning',
            data: morningData,
            created_at: `${date}T08:00:00Z`,
        }, { onConflict: 'user_id,type,created_at' }).then(() => { });

        // Evening check-in
        const eveningData = {
            late_caffeine: habits.caffeine_late,
            skipped_meals: habits.meals_count < 3,
            alcohol: (habits.alcohol_drinks || 0) > 0,
            exercise_done: habits.exercise_done,
            day_vs_expectations: habits.mood === 'great' || habits.mood === 'good' ? 'better' : habits.mood === 'neutral' ? 'same' : 'worse',
            mood: habits.mood,
            stress_level: habits.stress_level,
        };

        await supabase.from('check_ins').upsert({
            user_id: userId,
            type: 'evening',
            data: eveningData,
            created_at: `${date}T21:00:00Z`,
        }, { onConflict: 'user_id,type,created_at' }).then(() => { });

        console.log(`  ✅ ${date}: morning + evening check-ins`);
    }

    // Insert energy scores
    console.log('\n⚡ Inserting energy scores...');
    for (let i = 0; i < dates.length; i++) {
        const date = dates[i];
        const habits = habitPatterns[i] || habitPatterns[0];

        // Calculate a rough energy score
        let score = 5.0;
        if (habits.sleep_quality === 'excellent') score += 2;
        else if (habits.sleep_quality === 'good') score += 1;
        else if (habits.sleep_quality === 'poor') score -= 1.5;

        if (habits.exercise_done) score += 1;
        if (habits.caffeine_late) score -= 1;
        if ((habits.stress_level || 5) > 7) score -= 1;
        if (habits.mood === 'great') score += 0.5;
        else if (habits.mood === 'very_low') score -= 1;

        score = Math.max(1, Math.min(10, score));

        const explanation = habits.mood === 'great' || habits.mood === 'good'
            ? 'Good sleep and healthy habits are paying off!'
            : habits.caffeine_late
                ? 'Late caffeine may have affected your rest. Try cutting off earlier tomorrow.'
                : 'Mixed signals today - focus on consistency.';

        const { error } = await supabase
            .from('energy_scores')
            .upsert({
                user_id: userId,
                date: date,
                score: Math.round(score * 10) / 10,
                explanation: explanation,
            }, { onConflict: 'user_id,date' });

        if (error) {
            console.log(`  ⚠️ Error on ${date}:`, error.message);
        } else {
            console.log(`  ✅ ${date}: score ${Math.round(score * 10) / 10}`);
        }
    }

    console.log('\n✨ Mock data seeding complete!');
    console.log('🔄 Restart the app and check the Insights → Patterns tab.');
}

seedMockData().catch(console.error);
