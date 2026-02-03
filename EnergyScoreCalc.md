
## (Energy Score)final_score = clamp(base + sleep + hrv + activity + check_ins - habits ± random(0.5), 1, 10)

Full Energy Score Breakdown:

Starting Point
Component	Value
## Base Score	5.0
## Maximum Possible Bonuses (to reach 10)
Factor	Max Bonus	Condition
Sleep	+1.5	≥7.5 hours
HRV	+1.0	≥60ms
Steps	+0.8	≥10,000
Morning rested	+0.5	Score ≥8
Midday energy	+0.3	"high"
Evening expectations	+0.3	"better"
Random variance	+0.5	Luck
Total Max Bonus	+4.9	
Best case: 5.0 + 4.9 = 9.9 → clamped to ~10

Maximum Possible Penalties (to reach 1)
Factor	Max Penalty	Condition
Sleep	-1.5	<5.5 hours
HRV	-0.5	<30ms
Steps	-0.5	<3,000
Morning rested	-0.5	Score ≤3
Midday energy	-0.3	"low"
Evening expectations	-0.3	"worse"
Late caffeine	-0.2	Yes
Skipped meals	-0.3	Yes
Alcohol	-0.2	Yes
Random variance	-0.5	Luck
Total Max Penalty	-4.8	
Worst case: 5.0 - 4.8 = 0.2 → clamped to 1

## Flow

┌─────────────────────────────────────────────────────────┐
│                    BASE SCORE: 5                        │
└─────────────────────────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
   ┌─────────┐       ┌─────────┐       ┌─────────┐
   │  SLEEP  │       │   HRV   │       │  STEPS  │
   │ ±1.5    │       │ ±1.0    │       │ ±0.8    │
   └─────────┘       └─────────┘       └─────────┘
        │                  │                  │
        └──────────────────┼──────────────────┘
                           ▼
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
   ┌─────────┐       ┌─────────┐       ┌─────────┐
   │ MORNING │       │ MIDDAY  │       │ EVENING │
   │ CHECK-IN│       │ CHECK-IN│       │ CHECK-IN│
   │  ±0.5   │       │  ±0.3   │       │  ±0.3   │
   └─────────┘       └─────────┘       └─────────┘
                           │
                           ▼
              ┌───────────────────────┐
              │    HABIT PENALTIES    │
              │ Caffeine: -0.2        │
              │ Skipped meals: -0.3   │
              │ Alcohol: -0.2         │
              └───────────────────────┘
                           │
                           ▼
              ┌───────────────────────┐
              │   RANDOM VARIANCE     │
              │       ±0.5            │
              └───────────────────────┘
                           │
                           ▼
              ┌───────────────────────┐
              │   CLAMP(1, 10)        │
              │   Final Score         │
              └───────────────────────┘

              




              .
              .
              .
## User submits check-in
        ↓
Check-in saved to database
        ↓
recalculateEnergyScore() called
        ↓
┌───────────────────────────────┐
│  Fetch today's check-ins      │
│  Fetch today's health data    │
│  Calculate score (1-10)       │
│  Generate explanation (AI)    │
│  Save/update energy_scores    │
└───────────────────────────────┘
        ↓
Return updated energy score to app
        ↓
UI can display new score immediately

---

## Energy Level Labels (How "Your Energy Level" Text is Generated)

The energy level label displayed in the UI is determined by the numeric score:

| Score Range | Energy Level Label | Color | Description |
|-------------|-------------------|-------|-------------|
| 8.0 - 10.0 | **"High energy"** | 🟢 Green | You're feeling great! Peak performance. |
| 6.0 - 7.9 | **"Good energy"** | 🟢 Light Green | Above average, productive day ahead. |
| 4.5 - 5.9 | **"Steady energy"** | 🟡 Yellow | Neutral/balanced - not high, not low. |
| 3.0 - 4.4 | **"Low energy"** | 🟠 Orange | Below average, may need rest or a boost. |
| 1.0 - 2.9 | **"Very low energy"** | 🔴 Red | Rest and recovery recommended. |

### Code Logic:
```typescript
function getEnergyLevel(score: number): { label: string; color: string } {
    if (score >= 8.0) return { label: "High energy", color: "#22c55e" };
    if (score >= 6.0) return { label: "Good energy", color: "#84cc16" };
    if (score >= 4.5) return { label: "Steady energy", color: "#eab308" };
    if (score >= 3.0) return { label: "Low energy", color: "#f97316" };
    return { label: "Very low energy", color: "#ef4444" };
}
```

### Visual Representation:
```
Score: 1   2   3   4   5   6   7   8   9   10
       |---|---|---|---|---|---|---|---|---|
       |  Very  | Low |Steady| Good | High |
       |  Low   |     |      |      |      |
       🔴🔴🔴  🟠🟠  🟡🟡   🟢🟢  🟢🟢
```

---

## AI-Generated Explanation

The explanation text shown below the energy level (e.g., "Your solid sleep and good recovery really helped!") is generated in two ways:

### 1. AI/LLM Generated (Primary - uses Gemini)
When Gemini API is available, it generates personalized explanations:

```typescript
// Prompt sent to Gemini:
"You're a caring friend who knows health stuff. 
Score: 7.2/10
Context: Morning rested 8/10, Sleep 7.5hrs, HRV 55ms
Give a warm, brief explanation (2-3 sentences max)."
```

**Example outputs:**
- Score 8+: "You're doing great today! Your solid sleep and good recovery really helped. Keep this momentum going! 💪"
- Score 5-7: "Decent energy today. Good sleep is working for you. Maybe watch the afternoon slump."
- Score <5: "Energy is lower today. The short sleep might be a factor. Be gentle with yourself. 🌙"

### 2. Fallback Simple Explanation (when AI unavailable)
If Gemini API fails or rate-limits, a rule-based explanation is generated:

```typescript
function generateSimpleExplanation(score: number, factors: Factors): string {
    const positiveFactors = [];
    const negativeFactors = [];

    // Collect what helped/hurt
    if (factors.sleep > 0.5) positiveFactors.push('solid sleep');
    if (factors.sleep < -0.5) negativeFactors.push('short sleep');
    if (factors.hrv > 0) positiveFactors.push('good recovery');
    if (factors.morning > 0) positiveFactors.push('woke up refreshed');
    if (factors.midday < -0.2) negativeFactors.push('afternoon dip');
    if (factors.habits < -0.3) negativeFactors.push('some habits to watch');

    // Build message based on score
    if (score >= 7) {
        return `You're doing great today! Your ${positiveFactors.join(' and ')} really helped. 💪`;
    } else if (score >= 5) {
        return `Decent energy today. ${positiveFactors[0]} is working for you.`;
    } else {
        return `Energy is lower today. The ${negativeFactors[0]} might be a factor. 🌙`;
    }
}
```

---

## Factor Breakdown (What affects the explanation)

The AI receives context about which factors contributed positively or negatively:

| Factor | Positive Message | Negative Message |
|--------|------------------|------------------|
| Sleep > +0.5 | "solid sleep" | - |
| Sleep < -0.5 | - | "short sleep" |
| HRV > 0 | "good recovery" | - |
| HRV < 0 | - | "body needs rest" |
| Activity > 0 | "staying active" | - |
| Activity < 0 | - | "low movement" |
| Morning > 0 | "woke up refreshed" | - |
| Morning < -0.3 | - | "rough morning" |
| Midday > 0 | "strong afternoon" | - |
| Midday < -0.2 | - | "afternoon dip" |
| Habits < -0.3 | - | "some habits to watch" |

---

## Complete Example

**User's Day:**
- Sleep: 7.8 hours
- HRV: 58ms
- Steps: 8,500
- Morning check-in: rested_score = 7, motivation = "high"
- Midday check-in: energy_level = "ok", state = "focused"
- Evening check-in: day_vs_expectations = "as expected", no bad habits

**Calculation:**
```
Base:       5.0
+ Sleep:   +1.5 (7.8hrs ≥ 7.5)
+ HRV:     +0.5 (58ms ≥ 45)
+ Steps:   +0.5 (8,500 ≥ 7,500)
+ Morning: +0.5 (rested 7 ≥ 6, motivation high +0.3)
+ Midday:  +0.1 (energy "ok")
+ Evening:  0.0 (as expected)
- Habits:   0.0 (no penalties)
─────────────────
Total:      8.1 → clamped to 8.1
```

**Result:**
- **Score:** 8.1/10
- **Energy Level:** "High energy" 🟢
- **Explanation:** "You're doing great today! Your solid sleep and staying active really helped. Keep this momentum going! 💪"

---

# Daily Habits Tracking System

## Overview
The daily habits system tracks comprehensive lifestyle and mental health data that affects energy levels. This data is used for:
1. Real-time energy score calculation
2. Weekly pattern recognition
3. Personalized recommendations

---

## Daily Habits Data Fields

### Caffeine Tracking
| Field | Type | Description |
|-------|------|-------------|
| `caffeine_cups` | integer | Number of cups/servings |
| `caffeine_last_time` | time | Last caffeine intake time |
| `caffeine_late` | boolean | After 2pm = late (auto-calculated) |

### Sleep Tracking
| Field | Type | Description |
|-------|------|-------------|
| `sleep_hours` | decimal | Hours slept |
| `sleep_quality` | enum | poor, fair, good, excellent |
| `sleep_time` | time | Bedtime |
| `wake_time` | time | Wake time |
| `naps_taken` | integer | Number of naps |

### Alcohol Tracking
| Field | Type | Description |
|-------|------|-------------|
| `alcohol_drinks` | integer | Number of drinks |
| `alcohol_type` | string | Beer, wine, spirits, etc. |

### Exercise Tracking
| Field | Type | Description |
|-------|------|-------------|
| `exercise_done` | boolean | Did exercise? |
| `exercise_type` | string | Walking, running, gym, yoga, etc. |
| `exercise_duration` | integer | Minutes |
| `exercise_intensity` | enum | light, moderate, intense |

### Meals & Hydration
| Field | Type | Description |
|-------|------|-------------|
| `meals_count` | integer | Number of meals eaten |
| `meals_skipped` | string | breakfast, lunch, dinner |
| `meals_quality` | enum | unhealthy, mixed, healthy |
| `water_glasses` | integer | Glasses of water |

### Screen Time
| Field | Type | Description |
|-------|------|-------------|
| `screen_time_hours` | decimal | Total screen hours |
| `screen_before_bed` | boolean | Screen within 1hr of sleep |
| `social_media_hours` | decimal | Social media specifically |

### Mental Health Indicators
| Field | Type | Description |
|-------|------|-------------|
| `mood` | enum | very_low, low, neutral, good, great |
| `stress_level` | integer (1-10) | Current stress level |
| `anxiety_level` | integer (1-10) | Current anxiety level |
| `anger_incidents` | integer | Times felt angry/irritated |

### Social & Environment
| Field | Type | Description |
|-------|------|-------------|
| `social_interaction` | enum | none, minimal, moderate, lots |
| `outdoor_time` | integer | Minutes spent outdoors |
| `nature_exposure` | boolean | Time in nature/park |

### Mindfulness & Recovery
| Field | Type | Description |
|-------|------|-------------|
| `meditation_done` | boolean | Meditated today? |
| `meditation_minutes` | integer | Duration |
| `journaling_done` | boolean | Journaled today? |
| `gratitude_practiced` | boolean | Practiced gratitude? |

### Work & Productivity
| Field | Type | Description |
|-------|------|-------------|
| `work_hours` | decimal | Hours worked |
| `work_stress` | enum | low, moderate, high, extreme |
| `breaks_taken` | integer | Number of breaks |
| `productive_feeling` | boolean | Felt productive? |

### Negative Habits
| Field | Type | Description |
|-------|------|-------------|
| `smoking` | boolean | Smoked today? |
| `junk_food` | boolean | Ate junk food? |
| `late_night_eating` | boolean | Eating after 9pm |

---

## Updated Energy Score Formula

```
final_score = clamp(
    base (5.0)
    + sleep (±1.5)
    + hrv (±1.0) 
    + activity (±0.8)
    + check_ins (±1.6)
    + habits (±1.0)
    + mentalHealth (±1.0)
    + lifestyle (±0.4)
, 1, 10)
```

### New Habit-Based Factors

| Factor | Impact | Condition |
|--------|--------|-----------|
| **Caffeine** | -0.2 | Late caffeine |
| | -0.2 | >4 cups/day |
| **Sleep Quality** | +0.2 | Excellent quality |
| | -0.3 | Poor quality |
| **Alcohol** | -0.1 | 1-2 drinks |
| | -0.3 | 3+ drinks |
| **Exercise** | +0.3 | Did exercise |
| | +0.2 | 30+ minutes |
| **Hydration** | +0.2 | 8+ glasses |
| | -0.2 | <4 glasses |
| **Screen Before Bed** | -0.2 | Yes |
| **Mood** | +0.4 | Great |
| | -0.5 | Very low |
| **Stress** | -0.4 | Level ≥8 |
| | +0.2 | Level ≤3 |
| **Anxiety** | -0.3 | Level ≥7 |
| **Meditation** | +0.3 | Done |
| **Outdoor Time** | +0.2 | 30+ min |
| **Smoking** | -0.3 | Yes |
| **Junk Food** | -0.1 | Yes |
| **Work Stress** | -0.3 | Extreme |

---

# Weekly Pattern Recognition

## How It Works

```
┌─────────────────────────────────────┐
│  Collect 7 days of habit data       │
└─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────┐
│  Identify patterns:                 │
│  - Worst habits (frequency+impact)  │
│  - Best habits (frequency+impact)   │
│  - Correlations between habits      │
└─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────┐
│  Generate recommendations:          │
│  - Based on worst habits            │
│  - Prioritized by severity          │
│  - Time-of-day specific             │
└─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────┐
│  Save analysis + Show to user       │
└─────────────────────────────────────┘
```

## Pattern Detection Rules

### Worst Habits Identified
| Habit | Trigger | Severity |
|-------|---------|----------|
| Late Caffeine | ≥3 days with caffeine after 2pm | High if ≥5 days |
| High Caffeine | Avg >3 cups/day | High if >5 cups |
| Insufficient Sleep | ≥2 days with <6 hours | High if ≥4 days |
| Alcohol | >7 drinks/week or ≥4 drinking days | High if >14 drinks |
| Lack of Exercise | ≥5 days without exercise | High if 7 days |
| Screen Before Bed | ≥4 days | High if ≥6 days |
| High Stress | ≥3 days with stress ≥7 | High if ≥5 days |
| Skipping Meals | ≥3 days | Medium |
| Low Hydration | ≥4 days with <4 glasses | Medium |
| Frequent Irritation | ≥3 days with anger | High if ≥5 days |
| Smoking | Any day | Always High |
| Junk Food | ≥3 days | High if ≥5 days |

### Best Habits Identified
| Habit | Trigger | Severity |
|-------|---------|----------|
| Regular Exercise | ≥3 days | High if ≥5 days |
| Good Sleep | ≥4 days with 7-9 hours | High if ≥6 days |
| Meditation | ≥2 days | High if ≥5 days |
| Good Hydration | ≥3 days with 8+ glasses | High if ≥5 days |
| Outdoor Time | ≥3 days with 30+ min | Medium |
| Stress Management | ≥3 days with stress ≤3 | Medium |

## Correlations Detected

The system looks for cause-effect relationships:

| Trigger | Effect | What We Measure |
|---------|--------|-----------------|
| Late Caffeine | Lower energy next day | Compare energy on days after late caffeine |
| Exercise | Better mood | Mood comparison on exercise vs non-exercise days |
| Poor Sleep | Higher stress | Stress on days with <6 hours sleep |
| Meditation | Lower anxiety | Anxiety on meditation days |

---

## Recommendations Generated

Based on worst habits, the system generates actionable recommendations:

### Sample Recommendations

| Worst Habit | Recommendation | Priority |
|-------------|----------------|----------|
| Late Caffeine | "Switch to decaf after 2pm" | High |
| Insufficient Sleep | "Set a bedtime alarm 30 minutes earlier" | High |
| Lack of Exercise | "Take a 15-minute walk today" | Medium |
| Screen Before Bed | "Put phone away 1 hour before bed" | High |
| High Stress | "Try 5 minutes of deep breathing" | High |
| High Stress | "Take a nature walk" | Medium |
| Frequent Irritation | "Practice 2-minute meditation when frustrated" | Medium |
| Low Hydration | "Keep a water bottle at your desk" | Medium |
| Skipping Meals | "Prep healthy snacks for busy days" | Medium |
| Junk Food | "Swap one junk meal for a healthier option" | Low |
| Alcohol | "Try an alcohol-free day today" | Medium |
| Smoking | "When urge hits, take 5 deep breaths instead" | High |

---

## API Endpoints

### Habit Logging
```
POST /api/habits
Body: { caffeine_cups, mood, stress_level, ... }

GET /api/habits/today
GET /api/habits/history?days=7
POST /api/habits/quick { habit: "meditation_done", value: true }
```

### Pattern Analysis
```
GET /api/insights/habit-patterns
→ Returns: worstHabits, bestHabits, correlations, recommendations, summary

GET /api/insights/recommendations
→ Returns: Today's personalized recommendations

GET /api/insights/worst-habits
→ Returns: Top 3 worst habits + top recommendation (for Today screen)
```

---

## Example Weekly Analysis

**User's Week:**
- Late caffeine on 4/7 days
- Exercise on 2/7 days
- Meditation on 0/7 days
- Average stress: 7.2/10
- Average sleep: 6.2 hours

**Pattern Analysis Output:**
```json
{
  "worstHabits": [
    {
      "habit": "Late Caffeine",
      "frequency": 4,
      "severity": "medium",
      "description": "Had caffeine after 2pm on 4 of 7 days"
    },
    {
      "habit": "High Stress Levels",
      "frequency": 5,
      "severity": "high",
      "description": "Stress level ≥7 on 5 days"
    },
    {
      "habit": "Lack of Exercise",
      "frequency": 5,
      "severity": "medium",
      "description": "No exercise on 5 of 7 days"
    }
  ],
  "recommendations": [
    {
      "action": "Try 5 minutes of deep breathing",
      "reason": "Your stress levels were elevated this week",
      "priority": "high",
      "category": "mindfulness"
    },
    {
      "action": "Switch to decaf after 2pm",
      "reason": "Late caffeine disrupts sleep quality",
      "priority": "medium",
      "category": "caffeine"
    },
    {
      "action": "Take a 15-minute walk today",
      "reason": "Movement boosts energy and mood",
      "priority": "medium",
      "category": "exercise"
    }
  ],
  "summary": "Tough week - I see you. The high stress might be weighing on you. Try just one tiny improvement today. Small wins matter. 🌱"
}
```

---

## Database Tables

### `daily_habits`
Stores daily habit data for each user.

### `habit_patterns`
Stores weekly pattern analysis results:
- `worst_habits` (JSONB array)
- `best_habits` (JSONB array)
- `correlations` (JSONB array)
- `recommendations` (JSONB array)
- `avg_mood`, `avg_stress`, `avg_energy`, `avg_sleep_hours`
- `pattern_summary` (AI-generated text)