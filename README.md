# Clarity - Daily Energy & Recovery Companion

A mobile app that helps you understand **why** you feel the way you do and provides simple, actionable guidance to feel better today.

![React Native](https://img.shields.io/badge/React_Native-Expo-blue)
![Node.js](https://img.shields.io/badge/Backend-Node.js-green)
![Supabase](https://img.shields.io/badge/Database-Supabase-purple)

## 🌿 What is Clarity?

Clarity is your daily energy companion that:
- **Explains** why you feel tired, drained, or energized
- **Predicts** energy dips before they happen
- **Recommends** small, realistic actions (< 5 minutes)
- **Requires** less than 60 seconds per day

> *"Someone who understands my body and helps me make today easier."*

---

## ✨ Key Features

### 📊 Daily Energy Dashboard
- Personalized energy score (1-10)
- AI-generated explanations in plain English
- 2-3 actionable recommendations

### ✅ Lightweight Check-ins
- **Morning** (< 10 sec): How rested and motivated are you?
- **Mid-day** (optional): Current energy pulse
- **Evening** (< 15 sec): What drained you today?

### 📅 Calendar & Cognitive Load
- Connects to your device calendar (Google/Apple)
- Shows how meetings impact your energy
- Smart tips based on your schedule

### 🔗 Health Integration
- **iOS**: Apple HealthKit (sleep, steps, HRV)
- **Android**: Google Fit / Health Connect

### 🤖 AI Health Guide
- Chat with an AI that knows your health context
- Get personalized insights and weekly summaries

### 📈 Insights & Patterns
- Weekly energy trends
- Discover what drains vs. boosts your energy
- Calendar-energy correlations

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| Mobile App | React Native + Expo |
| Navigation | Expo Router |
| Backend API | Node.js + Express |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| AI | Google Gemini |
| Health Data | Apple HealthKit, Google Fit |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** v18+ 
- **npm** or **yarn**
- **Expo CLI**: `npm install -g expo-cli`
- **Android Studio** (for Android emulator) or **Xcode** (for iOS simulator)
- **Supabase** account (free tier works)

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd experiences.digital
```

### 2. Setup Backend

```bash
cd clarity-backend

# Install dependencies
npm install

# Create environment file
cp .env.example .env
```

Edit `.env` with your credentials:
```env
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_service_key
GEMINI_API_KEY=your_gemini_api_key
PORT=3000
```

Start the backend:
```bash
npm run dev
```

### 3. Setup Mobile App

```bash
cd clarity-app

# Install dependencies
npm install

# Create environment file
cp .env.example .env
```

Edit `.env`:
```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
EXPO_PUBLIC_API_URL=http://YOUR_IP:3000/api
```

> **Note:** For Android emulator, the app automatically uses `10.0.2.2` to reach your local backend.

### 4. Setup Database

Run the schema in Supabase SQL Editor:
```bash
# Copy contents of clarity-backend/supabase-schema.sql
# Paste into Supabase Dashboard → SQL Editor → Run
```

### 5. Run the App

**Android:**
```bash
cd clarity-app
npx expo run:android
```

**iOS:**
```bash
cd clarity-app
npx expo run:ios
```

**Development Mode (Expo Go):**
```bash
cd clarity-app
npx expo start
```
> Note: Health and Calendar features require a development build, not Expo Go.

---

## 📁 Project Structure

```
experiences.digital/
├── clarity-app/          # React Native mobile app
│   ├── app/              # Screens (Expo Router)
│   │   ├── (tabs)/       # Tab navigation screens
│   │   └── (auth)/       # Login/signup screens
│   ├── lib/              # Services & utilities
│   │   ├── energyService.ts
│   │   ├── calendarService.ts
│   │   ├── healthService.ts
│   │   └── aiService.ts
│   ├── components/       # Reusable components
│   └── types/            # TypeScript types
│
├── clarity-backend/      # Node.js API server
│   ├── src/
│   │   ├── routes/       # API endpoints
│   │   ├── services/     # Business logic
│   │   │   ├── energyCalculator.ts
│   │   │   └── gemini.ts
│   │   └── index.ts      # Server entry
│   └── supabase-schema.sql
│
└── docs/                 # Documentation
    ├── prd.health.md
    └── Calenderfeature.md
```

---

## 🔧 Common Issues

### Network Request Failed
- Check your IP address: `ifconfig | grep "inet " | grep -v 127.0.0.1`
- Update `EXPO_PUBLIC_API_URL` in `.env`
- Ensure backend is running on port 3000

### Android Emulator Can't Connect
- The app auto-detects Android emulator and uses `10.0.2.2`
- Restart emulator with "Cold Boot" if issues persist

### Calendar Not Working
- Calendar requires a **development build** (not Expo Go)
- Grant calendar permissions in device settings
- Enable "Use Mock Calendar Data" in Settings for testing

---

## 📱 App Screenshots

| Today | Insights | AI Guide | Settings |
|-------|----------|----------|----------|
| Energy score & tips | Weekly patterns | Chat with AI | Preferences |

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit changes: `git commit -m 'Add my feature'`
4. Push to branch: `git push origin feature/my-feature`
5. Open a Pull Request

---

## 📄 License

This project is private and proprietary.

---

## 🙋 Support

For questions or issues, please open a GitHub issue or contact the development team.

---

Built with 💚 for better daily energy
