import dotenv from 'dotenv';

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyBkNBg4jGF6KijKw-ReW5JrlwwEXqhoFVU';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

interface GeminiResponse {
    candidates: {
        content: {
            parts: { text: string }[];
        };
    }[];
}

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

interface HealthContext {
    sleepDuration?: number;
    sleepQuality?: number;
    steps?: number;
    hrv?: number;
    restingHeartRate?: number;
    activeCalories?: number;
    energyScore?: number;
    checkIns?: {
        morning?: { restedScore?: number; motivationLevel?: string };
        midday?: { energyLevel?: string; state?: string };
        evening?: { drainSource?: string; dayVsExpectations?: string };
    };
}

// Helper function to delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Core Gemini API call with retry logic
async function callGemini(prompt: string, systemPrompt?: string, retries = 3): Promise<string> {
    const contents = [];

    if (systemPrompt) {
        contents.push({
            role: 'user',
            parts: [{ text: `System context: ${systemPrompt}` }]
        });
        contents.push({
            role: 'model',
            parts: [{ text: 'Got it! I\'m here for you - let\'s figure this out together.' }]
        });
    }

    contents.push({
        role: 'user',
        parts: [{ text: prompt }]
    });

    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents,
                    generationConfig: {
                        temperature: 0.8,
                        maxOutputTokens: 200,
                        topP: 0.9,
                    },
                    safetySettings: [
                        {
                            category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
                            threshold: 'BLOCK_ONLY_HIGH'
                        }
                    ]
                }),
            });

            if (response.status === 429) {
                // Rate limited - wait and retry
                console.log(`Rate limited, waiting ${(attempt + 1) * 2} seconds before retry...`);
                await delay((attempt + 1) * 2000);
                continue;
            }

            if (!response.ok) {
                const error = await response.text();
                console.error('Gemini API error:', error);
                throw new Error(`Gemini API error: ${response.status}`);
            }

            const data = await response.json() as GeminiResponse;
            return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        } catch (error) {
            if (attempt === retries - 1) throw error;
            await delay((attempt + 1) * 1000);
        }
    }

    throw new Error('Failed after retries');
}

// Generate energy explanation using Gemini
export async function generateEnergyExplanation(
    score: number,
    context: string
): Promise<string> {
    const systemPrompt = `You are Clarity - a caring friend who happens to know a lot about health.
Speak directly to the user using "you" and "your".
Be warm and human - use casual language, not clinical terms.
Keep it real but supportive. Show you understand how they feel.
If they have meetings/calendar data, mention how their meeting schedule affects their energy.`;

    // Check if context has calendar data to emphasize it
    const hasCalendarData = context.toLowerCase().includes('meeting') || context.toLowerCase().includes('calendar');
    
    const prompt = `The user's energy is ${score}/10 today.

What we know: ${context}

In 1-2 SHORT sentences (max 35 words), explain why they might feel this way.
Be personal - start with something like "Looks like..." or "I notice..." or "Makes sense that..."
${hasCalendarData ? 'IMPORTANT: If there are meetings mentioned, explain how the meeting load impacts their energy level.' : ''}
End with empathy or a tiny tip.`;

    try {
        const response = await callGemini(prompt, systemPrompt);
        return response.trim();
    } catch (error) {
        console.error('Gemini explanation error:', error);
        throw error;
    }
}

// Generate personalized health insights
export async function generateHealthInsights(healthContext: HealthContext): Promise<string> {
    const systemPrompt = `You are Clarity - like a smart friend who really gets health stuff.
Talk TO the user, not ABOUT them. Use "you" constantly.
Be brief, warm, and real. No jargon. No lecturing.
Notice the good stuff, gently mention what could be better.`;

    const dataPoints: string[] = [];

    if (healthContext.sleepDuration) {
        dataPoints.push(`Sleep: ${healthContext.sleepDuration.toFixed(1)} hours`);
    }
    if (healthContext.steps) {
        dataPoints.push(`Steps: ${healthContext.steps.toLocaleString()}`);
    }
    if (healthContext.hrv) {
        dataPoints.push(`HRV: ${healthContext.hrv}ms`);
    }
    if (healthContext.restingHeartRate) {
        dataPoints.push(`Resting heart rate: ${healthContext.restingHeartRate}bpm`);
    }
    if (healthContext.activeCalories) {
        dataPoints.push(`Active calories: ${healthContext.activeCalories}kcal`);
    }
    if (healthContext.energyScore) {
        dataPoints.push(`Energy score: ${healthContext.energyScore}/10`);
    }

    const prompt = `Here's what I know about you today:
${dataPoints.join('\n')}

Give me 2 quick insights (2-3 sentences total, max 50 words).
Connect the dots between these numbers in a way that feels helpful.
Be encouraging - end with something positive or a simple tip.`;

    try {
        const response = await callGemini(prompt, systemPrompt);
        return response.trim();
    } catch (error) {
        console.error('Gemini insights error:', error);
        throw error;
    }
}

// AI Chat - conversational health assistant
export async function chat(
    message: string,
    history: ChatMessage[],
    healthContext?: HealthContext
): Promise<string> {
    const systemPrompt = `You are Clarity - think of yourself as a really supportive friend who happens to know a lot about wellness.

Your vibe:
- Warm and real, never robotic or preachy
- You USE the user's actual data to give personal advice
- Super brief: 2-3 sentences max unless they ask for more
- Use casual language: "totally", "honestly", "looks like"
- Show you care: "I get it", "that makes sense", "been there"

Rules:
- Never diagnose anything medical - gently suggest seeing a doctor if needed
- Reference their actual numbers when relevant
- Ask follow-up questions to understand better
- Be honest but kind

${healthContext ? `
Their current stats:
- Sleep: ${healthContext.sleepDuration?.toFixed(1) || '?'} hrs
- Steps: ${healthContext.steps?.toLocaleString() || '?'}
- HRV: ${healthContext.hrv || '?'}ms  
- Energy: ${healthContext.energyScore || '?'}/10
` : ''}`;

    // Build conversation history for context
    const contents: { role: string; parts: { text: string }[] }[] = [];

    // Add system context
    contents.push({
        role: 'user',
        parts: [{ text: systemPrompt }]
    });
    contents.push({
        role: 'model',
        parts: [{ text: "Hey! I'm Clarity 👋 I'm here to help you feel your best. What's on your mind?" }]
    });

    // Add conversation history
    for (const msg of history.slice(-10)) { // Keep last 10 messages for context
        contents.push({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }]
        });
    }

    // Add current message
    contents.push({
        role: 'user',
        parts: [{ text: message }]
    });

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            contents,
            generationConfig: {
                temperature: 0.8,
                maxOutputTokens: 500,
                topP: 0.9,
            },
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        console.error('Gemini chat error:', error);
        throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json() as GeminiResponse;
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't process that. Could you try again?";
}

// Generate recommended actions using AI - always returns at least 3 actions
export async function generateSmartActions(
    score: number,
    context: string,
    healthContext?: HealthContext
): Promise<{ id: string; title: string; reason: string }[]> {
    const systemPrompt = `You are Clarity - a wellness coach generating quick, actionable tips.
Be friendly and specific. Make actions doable in 5 minutes or less.
Focus on immediate mood and energy boosters.
If user has heavy meetings, suggest recovery breaks.`;

    const timeOfDay = new Date().getHours() < 12 ? 'morning' :
        new Date().getHours() < 17 ? 'afternoon' : 'evening';

    // Check for calendar/meeting context
    const hasHeavyMeetings = context.toLowerCase().includes('heavy meeting') || 
                              context.toLowerCase().includes('back-to-back') ||
                              context.toLowerCase().includes('6 meetings') ||
                              context.toLowerCase().includes('5 meetings');
    const hasLateMeetings = context.toLowerCase().includes('late meeting');

    const prompt = `Energy Score: ${score}/10
Time: ${timeOfDay}
${context}
${healthContext?.sleepDuration ? `Sleep last night: ${healthContext.sleepDuration.toFixed(1)} hours` : ''}
${healthContext?.steps ? `Steps today: ${healthContext.steps}` : ''}
${healthContext?.checkIns?.morning ? `Morning state: ${healthContext.checkIns.morning.motivationLevel || 'unknown'}` : ''}
${healthContext?.checkIns?.midday ? `Current energy: ${healthContext.checkIns.midday.energyLevel || 'unknown'}` : ''}

${hasHeavyMeetings ? 'NOTE: Heavy meeting day - prioritize recovery actions like breaks, breathing, protecting lunch.' : ''}
${hasLateMeetings ? 'NOTE: Late meeting today - include wind-down or sleep-protection tip.' : ''}

Generate exactly 3 quick actions they can do RIGHT NOW to feel better.
Make them specific to their current energy level, time of day, and meeting schedule.

Format as JSON array:
[
  {"id": "1", "title": "Do this now (3-6 words)", "reason": "Why it helps (max 8 words)"},
  {"id": "2", "title": "Try this next (3-6 words)", "reason": "The benefit (max 8 words)"},
  {"id": "3", "title": "Also consider (3-6 words)", "reason": "Because... (max 8 words)"}
]
Return ONLY the JSON array, nothing else.`;

    try {
        const response = await callGemini(prompt, systemPrompt);
        // Extract JSON from response
        const jsonMatch = response.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            const actions = JSON.parse(jsonMatch[0]);
            // Ensure we have at least 3 actions
            if (actions.length >= 3) {
                return actions.slice(0, 3);
            }
        }
    } catch (error) {
        console.error('Gemini actions error:', error);
    }

    // Fallback actions based on time of day and energy level
    return getDefaultActions(score, timeOfDay);
}

// Fallback actions when LLM fails
function getDefaultActions(score: number, timeOfDay: string): { id: string; title: string; reason: string }[] {
    if (score < 4) {
        // Low energy fallbacks
        return [
            { id: '1', title: 'Take 5 deep breaths', reason: 'Resets your nervous system' },
            { id: '2', title: 'Drink a glass of water', reason: 'Dehydration causes fatigue' },
            { id: '3', title: 'Step outside for 2 minutes', reason: 'Fresh air boosts alertness' },
        ];
    } else if (score < 7) {
        // Medium energy fallbacks
        return [
            { id: '1', title: 'Do 10 jumping jacks', reason: 'Quick burst of energy' },
            { id: '2', title: 'Stretch for 3 minutes', reason: 'Releases tension and wakes you up' },
            { id: '3', title: 'Listen to upbeat music', reason: 'Music elevates mood fast' },
        ];
    } else {
        // High energy - maintain it
        return [
            { id: '1', title: 'Tackle your top priority', reason: 'Ride the momentum!' },
            { id: '2', title: 'Help someone out', reason: 'Boosts your mood even more' },
            { id: '3', title: 'Plan something fun', reason: 'Keep the positivity flowing' },
        ];
    }
}

// Weekly insights summary
export async function generateWeeklySummary(
    weeklyData: {
        avgSleep: number;
        avgSteps: number;
        avgEnergy: number;
        bestDay: string;
        worstDay: string;
    }
): Promise<string> {
    const systemPrompt = `You are Clarity - a supportive friend checking in on their week.
Be real, warm, and brief. Celebrate wins, gently note what could improve.
Talk TO them, not about them.`;

    const prompt = `Your week in review:
- Sleep: ${weeklyData.avgSleep.toFixed(1)} hrs/night avg
- Steps: ${weeklyData.avgSteps.toLocaleString()}/day avg
- Energy: ${weeklyData.avgEnergy.toFixed(1)}/10 avg
- Best day: ${weeklyData.bestDay}
- Toughest day: ${weeklyData.worstDay}

In 2-3 sentences (max 40 words), tell them how their week went.
Notice one pattern. Give one tiny tip for next week.
Start with something like "Nice week!" or "Solid effort!" or "I see you..."`;

    try {
        const response = await callGemini(prompt, systemPrompt);
        return response.trim();
    } catch (error) {
        console.error('Gemini weekly summary error:', error);
        throw error;
    }
}

// Types for pattern insights
export interface LLMPatternInsights {
    drainCard: {
        title: string;
        emoji: string;
        frequency: string;
        context: string;
        impact: string;
        action: string;
    } | null;
    boosterCard: {
        title: string;
        emoji: string;
        frequency: string;
        context: string;
        impact: string;
        action: string;
    } | null;
    todayCard: {
        title: string;
        emoji: string;
        why: string;
        action: string;
        when: string;
        benefit: string;
    };
    experiment: {
        focus: string;
        emoji: string;
        goal: string;
        action: string;
        howTo: string;
        commitment: string;
        checkInDay: string;
    };
}

export interface HabitDataSummary {
    checkIns: {
        morning: { count: number; avgRested?: number; motivationLevels?: string[] };
        midday: { count: number; energyLevels?: string[]; states?: string[] };
        evening: { count: number; drainSources?: string[]; expectations?: string[] };
    };
    habits: {
        lateCaffeineDays: number;
        avgCaffeineCups: number;
        avgSleepHours: number;
        poorSleepDays: number;
        exerciseDays: number;
        alcoholDays: number;
        totalDrinks: number;
        highStressDays: number;
        meditationDays: number;
        screenBeforeBedDays: number;
        junkFoodDays: number;
        skippedMealsDays: number;
        outdoorDays: number;
        totalDays: number;
    };
    energyScores: {
        average: number;
        trend: 'up' | 'down' | 'stable';
        bestDay?: string;
        worstDay?: string;
    };
}

// Generate LLM-powered pattern insights
export async function generatePatternInsights(
    habitData: HabitDataSummary
): Promise<LLMPatternInsights> {
    const systemPrompt = `You are Clarity - a caring wellness coach analyzing someone's weekly habits.
Be warm, personal, and insightful. Use "you" and "your" to speak directly to them.
Generate insights that feel like they come from a friend who really understands their patterns.
Be specific about the data you see, not generic. Make the advice actionable and realistic.`;

    const prompt = `Here's this person's week:

CHECK-INS:
- Morning: ${habitData.checkIns.morning.count} check-ins, avg rested: ${habitData.checkIns.morning.avgRested?.toFixed(1) || 'N/A'}/10
- Midday: ${habitData.checkIns.midday.count} check-ins, energy levels: ${habitData.checkIns.midday.energyLevels?.join(', ') || 'N/A'}
- Evening: ${habitData.checkIns.evening.count} check-ins, main drains: ${habitData.checkIns.evening.drainSources?.join(', ') || 'N/A'}

HABITS (out of ${habitData.habits.totalDays} days):
- Late caffeine (after 2pm): ${habitData.habits.lateCaffeineDays} days
- Avg caffeine: ${habitData.habits.avgCaffeineCups.toFixed(1)} cups/day
- Sleep: ${habitData.habits.avgSleepHours.toFixed(1)} hrs avg, ${habitData.habits.poorSleepDays} poor sleep days
- Exercise: ${habitData.habits.exerciseDays} days
- High stress: ${habitData.habits.highStressDays} days
- Screen before bed: ${habitData.habits.screenBeforeBedDays} days
- Alcohol: ${habitData.habits.alcoholDays} days, ${habitData.habits.totalDrinks} total drinks
- Meditation: ${habitData.habits.meditationDays} days
- Outdoor time: ${habitData.habits.outdoorDays} days
- Junk food: ${habitData.habits.junkFoodDays} days
- Skipped meals: ${habitData.habits.skippedMealsDays} days

ENERGY:
- Average: ${habitData.energyScores.average.toFixed(1)}/10
- Trend: ${habitData.energyScores.trend}
${habitData.energyScores.bestDay ? `- Best day: ${habitData.energyScores.bestDay}` : ''}
${habitData.energyScores.worstDay ? `- Hardest day: ${habitData.energyScores.worstDay}` : ''}

Based on this data, generate personalized insights in this EXACT JSON format:
{
  "drainCard": {
    "title": "Short habit name causing energy drain (2-4 words)",
    "emoji": "Single relevant emoji",
    "frequency": "How often this happened (e.g., '5 out of 7 days')",
    "context": "When/why this tends to happen (1 sentence)",
    "impact": "How this affected their energy (1 sentence)",
    "action": "One specific thing to try today (1 sentence)"
  },
  "boosterCard": {
    "title": "Short habit name boosting energy (2-4 words)",
    "emoji": "Single positive emoji",
    "frequency": "How often this happened",
    "context": "When this worked best",
    "impact": "The positive effect noticed",
    "action": "How to do more of this"
  },
  "todayCard": {
    "title": "One thing to do TODAY (3-5 words)",
    "emoji": "Single motivating emoji",
    "why": "Why this specific action based on their data (1 sentence)",
    "action": "The specific action in clear terms",
    "when": "Best time to do it (e.g., 'This morning', 'After lunch')",
    "benefit": "What they'll feel after (1 short sentence)"
  },
  "experiment": {
    "focus": "Name of the mini-experiment (2-4 words)",
    "emoji": "Single relevant emoji",
    "goal": "What they'll achieve (1 sentence)",
    "action": "The specific action to take",
    "howTo": "Practical tip to make it easy",
    "commitment": "Duration/frequency (e.g., 'Just 3 days')",
    "checkInDay": "Friday"
  }
}

If there's not enough data for drainCard or boosterCard, set them to null.
todayCard must ALWAYS be provided with a helpful, actionable suggestion.
Return ONLY valid JSON, no other text.`;

    try {
        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [
                    { role: 'user', parts: [{ text: `System: ${systemPrompt}` }] },
                    { role: 'model', parts: [{ text: "I'll analyze the data and provide personalized insights." }] },
                    { role: 'user', parts: [{ text: prompt }] }
                ],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 1000,
                    topP: 0.9,
                },
            }),
        });

        if (!response.ok) {
            console.error('Gemini pattern insights error:', await response.text());
            throw new Error(`Gemini API error: ${response.status}`);
        }

        const data = await response.json() as GeminiResponse;
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        // Extract JSON from response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return parsed as LLMPatternInsights;
        }

        throw new Error('Failed to parse LLM response');
    } catch (error) {
        console.error('generatePatternInsights error:', error);
        // Return fallback
        return getDefaultPatternInsights(habitData);
    }
}

// Fallback when LLM fails
function getDefaultPatternInsights(habitData: HabitDataSummary): LLMPatternInsights {
    // Determine worst habit
    let drainCard = null;
    if (habitData.habits.lateCaffeineDays >= 3) {
        drainCard = {
            title: 'Late Caffeine',
            emoji: '☕',
            frequency: `${habitData.habits.lateCaffeineDays} out of ${habitData.habits.totalDays} days`,
            context: 'Having coffee or tea after 2pm',
            impact: 'This may be affecting your sleep quality',
            action: 'Try switching to herbal tea this afternoon'
        };
    } else if (habitData.habits.poorSleepDays >= 2) {
        drainCard = {
            title: 'Insufficient Sleep',
            emoji: '😴',
            frequency: `${habitData.habits.poorSleepDays} nights with less than 6 hours`,
            context: 'Getting less rest than your body needs',
            impact: 'Low sleep directly impacts your energy and focus',
            action: 'Try going to bed 30 minutes earlier tonight'
        };
    }

    // Determine best habit
    let boosterCard = null;
    if (habitData.habits.exerciseDays >= 2) {
        boosterCard = {
            title: 'Regular Movement',
            emoji: '🏃',
            frequency: `${habitData.habits.exerciseDays} days this week`,
            context: 'Getting your body moving',
            impact: 'Exercise boosts your mood and energy',
            action: 'Keep it up! Even a short walk counts'
        };
    } else if (habitData.habits.meditationDays >= 1) {
        boosterCard = {
            title: 'Mindfulness Practice',
            emoji: '🧘',
            frequency: `${habitData.habits.meditationDays} days this week`,
            context: 'Taking time to center yourself',
            impact: 'This helps reduce stress and improve focus',
            action: 'Try adding 5 more minutes to your practice'
        };
    }

    return {
        drainCard,
        boosterCard,
        todayCard: {
            title: 'Take a 10-minute walk',
            emoji: '🚶',
            why: 'Movement boosts energy and clears your mind',
            action: 'Step outside for a short walk around the block',
            when: 'After lunch or whenever you feel sluggish',
            benefit: "You'll feel more energized and focused"
        },
        experiment: {
            focus: 'Morning Sunlight',
            emoji: '🌅',
            goal: 'Boost morning energy and alertness naturally',
            action: 'Get outside within 30 minutes of waking',
            howTo: 'Take your coffee outside or walk to get it',
            commitment: 'Just try it for 3 mornings',
            checkInDay: 'Friday'
        }
    };
}

export { callGemini, ChatMessage, HealthContext };
