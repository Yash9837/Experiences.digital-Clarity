Energy Copilot App Product
Requirements Document (PRD)
Product Name (Working)
Clarity
Daily Energy & Recovery Copilot
1. Problem Statement
Millions of people feel chronically tired, mentally drained, or inconsistent in energy, despite
sleeping, exercising, and “doing the right things.”
Existing health and wellness apps fail because they:
● Surface metrics without meaning
● Require high effort (manual logging, complex dashboards)
● Focus on optimization, not restoring baseline well-being
● Do not explain why today feels worse than yesterday
Core Problem
Users experience daily energy fluctuations but lack clear, actionable
explanations and simple guidance to feel better today.
This results in confusion, anxiety, and abandonment of health tools.
2. Product Vision
Create a daily companion app that:
● Explains why users feel the way they do
● Predicts energy dips before they happen
● Recommends small, realistic actions
● Requires less than one minute per day
The product should feel like:
“Someone who understands my body and helps me make today easier.”
3. Target Users
Primary ICP
● Ages 25–55
● Busy adults, knowledge workers, parents
● Generally healthy but feel “off,” tired, or inconsistent
● Overwhelmed by health data but still motivated to feel better
Secondary ICP
● Burnout-prone professionals
● Remote and hybrid workers
● Users of wearables who feel data-rich but insight-poor
Explicitly not targeting:
● Elite athletes
● Medical patients
● Biohacking or quantified-self enthusiasts
4. Jobs To Be Done (JTBD)
1. Understand energy
○ “Why do I feel like this today?”
2. Reduce uncertainty
○ “Is this normal or something I should worry about?”
3. Take simple action
○ “What’s the one thing I should do right now?”
4. Feel in control
○ “I can prevent this next time.”
5. Core Value Proposition
Clear explanations + simple actions → better days.
This product does not compete on tracking.
It competes on interpretation and clarity.
6. Key Features (MVP Scope)
6.1 Daily Energy Score & Explanation (Core Experience)
User sees (single primary screen):
● Energy score (1–10)
● Plain-English explanation (1–2 sentences)
● Maximum of 2–3 recommended actions
Example:
Energy Today: 6.5 / 10
You slept enough hours, but later than usual, and yesterday involved
prolonged mental effort. This combination often leads to a mid-day energy
dip.
Try today:
• Delay caffeine until 9:30am
• Take a 10-minute walk before noon
No charts required to get value.
6.2 Lightweight Daily Check-Ins (≤60 seconds/day)
Purpose
Capture subjective energy and cognitive state, which is the most reliable indicator of daily
well-being. These signals anchor all interpretations and explanations.
The design prioritizes speed, structure, and consistency.
Morning Check-In (Required)
Triggered via notification or app open.
Inputs:
1. “How rested do you feel right now?”
○ Scale: 1–10
2. “How motivated do you feel to start the day?”
○ Low / Medium / High
Value:
● Establishes perceived recovery baseline
● Anchors daily energy modeling
● <10 seconds to complete
Mid-Day Energy Pulse (Optional)
Triggered during predicted dip window (default: 1–3pm).
Inputs:
1. “How’s your energy right now?”
○ Low / OK / High
2. “Which best describes your state?”
○ Mentally drained
○ Physically tired
○ Distracted
○ Fine
Value:
● Validates or refines predictions
● Distinguishes mental vs physical fatigue
● Enables just-in-time guidance
Evening Reflection (Required)
Triggered in evening or pre-bed.
Inputs (single-tap):
1. “What drained you most today?”
○ Poor sleep
○ Work / mental load
○ Physical exertion
○ Emotional stress
○ Poor meals or timing
○ Unknown
2. “How did today compare to expectations?”
○ Better / Same / Worse
Value:
● Captures perceived causality
● Trains explanation accuracy
● Improves future forecasts
Data Handling
● No free text required
● Structured, categorical inputs only
● Skippable without penalty
● Stored as time-series signals tied to daily outcomes
6.3 Passive & Integrated Data Sources (Opt-In)
Purpose
Improve explanation quality using low-friction passive signals, while ensuring the product
delivers value even without integrations.
All integrations are optional, permission-based, and transparent.
6.3.1 Sleep Data
Primary Integrations:
● Apple Health (iOS)
● Google Health Connect (Android)
Data used:
● Total sleep duration
● Bedtime and wake time
● Sleep consistency (variance over days)
Fallback (No Wearable):
● Phone lock/unlock patterns
● Alarm usage
● Screen activity near bedtime
Rationale:
Sleep timing consistency is more predictive of energy than sleep stages.
6.3.2 Calendar & Cognitive Load
Integrations:
● Google Calendar
● Apple Calendar
● Microsoft Outlook (Phase 2)
Data accessed (explicitly limited):
● Meeting start/end times
● Meeting density
● Gaps between meetings
● Late-day meetings
Explicitly not accessed:
● Titles
● Attendees
● Notes
● Content
Rationale:
Meeting density and lack of recovery gaps are major hidden energy drains.
6.3.3 Movement & Sedentary Behavior
Integrations:
● Apple Health
● Google Health Connect
● Device motion sensors (fallback)
Data used:
● Step count ranges (low / medium / high)
● Long sedentary blocks
● Presence or absence of movement
Rationale:
Explains afternoon crashes and enables low-effort recovery actions.
6.3.4 Habit & Context Flags (Binary)
Collected via 1-tap prompts.
Signals:
● Late caffeine (after user-defined cutoff): Yes / No
● Skipped or delayed meals: Yes / No
● Alcohol previous evening: Yes / No
Collection points:
● Evening reflection
● Occasional reminders if missing
Rationale:
Binary inputs reduce friction while capturing sufficient signal.
6.3.5 Optional Wearable Enhancements (Phase 2)
Supported:
● Apple Watch
● Oura
● Fitbit
● Whoop
Used for:
● Sleep consistency validation
● Recovery trend confirmation
Not surfaced to users:
● HRV
● Raw biometrics
● Readiness scores
Wearables enhance confidence, not dependency.
6.3.6 Data Fusion & Explanation Engine (High-Level)
