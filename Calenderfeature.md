Calendar & Cognitive Load UI Feature - Implementation Plan
Overview
Add visual calendar/cognitive load awareness to help users understand how their meeting schedule impacts mental energy. This aligns with Clarity's core mission: explaining WHY users feel the way they do.

IMPORTANT

Privacy-First: We only access meeting start/end times - never titles, attendees, or content.

Proposed Changes
1. Dashboard (Today's Tab) - "Today's Mental Load" Card
A new card showing today's meeting schedule impact with actionable tips.

┌────────────────────────────────────────────┐
│  📅 Today's Mental Load                    │
├────────────────────────────────────────────┤
│                                            │
│  ⚡ MODERATE LOAD                          │
│  ████████░░░░░░░ 4.2 hrs in meetings      │
│                                            │
│  🔍 Quick View                             │
│  ┌──────────────────────────────────────┐  │
│  │ ● 9:00 ───── 11:30   (2.5 hrs)       │  │
│  │ ○ 11:30 ──── 12:30   Break (1 hr)    │  │
│  │ ● 12:30 ───── 1:30   (1 hr)          │  │
│  │ ○ 1:30 ──────── --   Free afternoon  │  │
│  └──────────────────────────────────────┘  │
│                                            │
│  💡 You have 2 back-to-back meetings.     │
│     Try a 2-min breathing break between.  │
│                                            │
└────────────────────────────────────────────┘
Key Elements:

Element	Data Source	Purpose
Cognitive Load Level	
getCognitiveLoadScore()
Light/Moderate/Heavy/Intense
Meeting Hours Bar	meetingHours	Visual progress bar
Timeline View	First/Last meeting times	Show meeting blocks vs gaps
Actionable Tip	Based on metrics	Personalized recovery suggestion
Smart Tips Based on Metrics:

Condition	Tip
backToBack >= 2	"2+ back-to-back meetings. Try a 2-min breathing break between."
meetingDensity >= 0.6	"Heavy meeting day. Protect your lunch break for recovery."
lateMeetings >= 1	"Late meeting today. Plan 15 min wind-down before bed."
longestGap < 30	"Fragmented day ahead. Use any 15-min gap for a walk."
meetingCount == 0	"Meeting-free day! Great time for deep work. 🌿"
2. Dashboard - Integration with Energy Score
Show calendar impact on the energy explanation:

Before (current):

"You slept 7 hours and reported feeling rested..."

After (enhanced):

"You slept 7 hours but have a heavy meeting day (6 meetings, 4 back-to-back). Expect an afternoon dip — protect your breaks."

This is already partially working via the backend's factors.calendar, but we'll make it more explicit in AI prompts.

3. Insights Tab - Weekly Meeting Patterns
A new section showing weekly calendar patterns.

┌────────────────────────────────────────────┐
│  📊 Weekly Meeting Patterns                │
├────────────────────────────────────────────┤
│                                            │
│  This Week vs Last Week                    │
│  ┌────────────────────────────────────┐    │
│  │ Mon  ████████░░  4.5 hrs           │    │
│  │ Tue  ██████████  6.2 hrs  ⚠️       │    │
│  │ Wed  ███░░░░░░░  2.0 hrs           │    │
│  │ Thu  ████████░░  5.0 hrs           │    │
│  │ Fri  ██░░░░░░░░  1.5 hrs  ✨       │    │
│  │ Sat  ░░░░░░░░░░  0 hrs             │    │
│  │ Sun  ░░░░░░░░░░  0 hrs             │    │
│  └────────────────────────────────────┘    │
│                                            │
│  📈 Weekly total: 19.2 hours in meetings  │
│  🏆 Best day: Friday (lightest load)       │
│  ⚠️ Watch: Tuesday (heaviest + low energy) │
│                                            │
└────────────────────────────────────────────┘
4. Insights Tab - Calendar-Energy Correlation Card
Show the relationship between meeting load and energy scores.

┌────────────────────────────────────────────┐
│  🔗 Meeting Load vs Energy                 │
├────────────────────────────────────────────┤
│                                            │
│  Pattern Discovered:                       │
│  "Your energy drops 1.2 points on days    │
│   with 4+ hours of meetings."              │
│                                            │
│  💡 Try This Week:                         │
│  Block 30 min after long meeting blocks   │
│  for recovery time.                        │
│                                            │
└────────────────────────────────────────────┘
File Changes Summary
Frontend (clarity-app)
[MODIFY] 
index.tsx
Add import for calendarService functions
Add state for calendar metrics: calendarMetrics, calendarTip
Add 
fetchTodayCalendarData()
 call in 
loadData()
Add new <TodaysMentalLoadCard /> component
Place card after "Today's Journey" section
[MODIFY] 
insights.tsx
Add import for calendar functions
Add state for weekly calendar data
Add 
fetchWeekCalendarData()
 call in 
loadData()
Add <WeeklyMeetingPatterns /> component
Add calendar-energy correlation insight card
[MODIFY] 
calendarService.ts
Add getSmartTip(metrics: CognitiveLoadMetrics): string function
Add formatTimelineBlocks(metrics) for visual timeline
Backend (clarity-backend)
[MODIFY] 
energyCalculator.ts
Enhance 
buildContext()
 to include calendar details for AI prompts
[MODIFY] 
gemini.ts
Update prompts to explicitly mention meeting schedule when generating explanations
New Components Design
TodaysMentalLoadCard Component
interface CalendarCardProps {
    metrics: CognitiveLoadMetrics | null;
    loading: boolean;
}
function TodaysMentalLoadCard({ metrics, loading }: CalendarCardProps) {
    // Shows:
    // - Cognitive load level (Light/Moderate/Heavy/Intense) with color
    // - Meeting hours progress bar
    // - Simple timeline visualization
    // - Smart tip based on metrics
}
WeeklyMeetingPatterns Component
interface WeeklyCalendarProps {
    weekData: DailyCognitiveLoad[];
}
function WeeklyMeetingPatterns({ weekData }: WeeklyCalendarProps) {
    // Shows:
    // - Daily bar chart of meeting hours
    // - Weekly total
    // - Best/worst days
    // - Energy correlation insights
}
Auto-Sync Improvement
Currently calendar only syncs manually. We should auto-sync on dashboard load:

// In Dashboard loadData():
const loadData = async () => {
    // ... existing code ...
    
    // Auto-sync calendar if enabled
    const calendarEnabled = await isCalendarEnabled();
    if (calendarEnabled) {
        await syncCalendarData(); // Sync first
        const metrics = await fetchTodayCalendarData();
        setCalendarMetrics(metrics);
    }
};
Verification Plan
Manual Testing
Dashboard Card

Enable calendar in Settings
Return to Dashboard → Should see "Today's Mental Load" card
Verify meeting hours and tip match calendar events
Test with different meeting loads (empty day, heavy day)
Insights Tab

Navigate to Insights tab
Should see "Weekly Meeting Patterns" section
Verify bar chart shows correct hours per day
Check best/worst day identification
Edge Cases

No calendar connected → Card should not appear
Calendar with no events → "Meeting-free day" message
Expo Go → Should show "Not available" gracefully
Automated Tests
No existing tests found for calendar integration
Manual verification is primary approach