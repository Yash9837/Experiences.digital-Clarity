// ═══════════════════════════════════════════════════════════════════
// CLARITY APP - NATURE-INSPIRED COLOR PALETTE
// Sage Green (growth/calm) + Terracotta (energy) + Cream/Beige backgrounds
// Designed to feel organic, warm, and non-clinical
// ═══════════════════════════════════════════════════════════════════

const Colors = {
  // ─────────────────────────────────────────────────────────────────
  // PRIMARY: Sage Green - Calm, growth, health
  // ─────────────────────────────────────────────────────────────────
  primary: {
    50: '#F6F9F4',
    100: '#E8F0E3',
    200: '#D4E4CA',
    300: '#B5D1A4',
    400: '#8FB87A',
    500: '#6B9B59', // Main sage green
    600: '#537A45',
    700: '#425F38',
    800: '#374D30',
    900: '#2F4029',
  },

  // ─────────────────────────────────────────────────────────────────
  // ACCENT: Terracotta/Warm Orange - Energy, warmth, action
  // ─────────────────────────────────────────────────────────────────
  accent: {
    50: '#FEF6F3',
    100: '#FCEAE3',
    200: '#FAD5C7',
    300: '#F5B49D',
    400: '#ED8B6B',
    500: '#E2714D', // Main terracotta
    600: '#C85A3A',
    700: '#A64830',
    800: '#873D2C',
    900: '#6F3528',
  },

  // ─────────────────────────────────────────────────────────────────
  // CREAM: Warm organic backgrounds
  // ─────────────────────────────────────────────────────────────────
  cream: {
    50: '#FEFDFB',
    100: '#FDF9F3',
    200: '#FAF3E8',
    300: '#F5EAD6',
    400: '#EDDDC0',
    500: '#E3CBAA',
    600: '#D4B48D',
    700: '#BF9A6B',
    800: '#A27F52',
    900: '#856642',
  },

  // ─────────────────────────────────────────────────────────────────
  // EARTH: Text and neutral tones
  // ─────────────────────────────────────────────────────────────────
  neutral: {
    50: '#FAF9F7',
    100: '#F3F1ED',
    200: '#E8E4DD',
    300: '#D5CFC5',
    400: '#B8AFA2',
    500: '#918778',
    600: '#716859',
    700: '#574F43',
    800: '#3E3830',
    900: '#2A2621',
  },

  // ─────────────────────────────────────────────────────────────────
  // SUCCESS: Nature green for positive states
  // ─────────────────────────────────────────────────────────────────
  success: {
    50: '#F0F9F4',
    100: '#D1F0DE',
    200: '#A7E3C2',
    300: '#6ECE9D',
    400: '#3DB579',
    500: '#22A05B', // Fresh green
    600: '#198A4C',
    700: '#156F3E',
    800: '#135934',
    900: '#10492B',
  },

  // ─────────────────────────────────────────────────────────────────
  // WARNING: Warm amber
  // ─────────────────────────────────────────────────────────────────
  warning: {
    50: '#FFFBEB',
    100: '#FEF3C7',
    200: '#FDE68A',
    300: '#FCD34D',
    400: '#FBBF24',
    500: '#F59E0B',
    600: '#D97706',
    700: '#B45309',
    800: '#92400E',
    900: '#78350F',
  },

  // ─────────────────────────────────────────────────────────────────
  // ERROR: Soft rose/coral
  // ─────────────────────────────────────────────────────────────────
  error: {
    50: '#FEF6F5',
    100: '#FDE8E6',
    200: '#FBD0CC',
    300: '#F7AEA6',
    400: '#F08072',
    500: '#E45A4A', // Soft coral red
    600: '#CF3F2E',
    700: '#AD3224',
    800: '#8F2B21',
    900: '#772921',
  },

  // ─────────────────────────────────────────────────────────────────
  // BACKGROUND COLORS
  // ─────────────────────────────────────────────────────────────────
  background: {
    primary: '#FDF9F3',    // Warm cream
    secondary: '#FAF3E8',  // Slightly darker cream
    tertiary: '#F5EAD6',   // Beige
    card: '#FFFFFF',       // White cards
    dark: '#2A2621',       // Earth dark
    gradient: ['#6B9B59', '#425F38'], // Sage gradient
  },

  // ─────────────────────────────────────────────────────────────────
  // TEXT COLORS
  // ─────────────────────────────────────────────────────────────────
  text: {
    primary: '#2A2621',    // Earth dark
    secondary: '#574F43',  // Earth medium
    tertiary: '#918778',   // Earth light
    inverse: '#FFFFFF',    // White
    accent: '#6B9B59',     // Sage green
  },

  // ─────────────────────────────────────────────────────────────────
  // ENERGY SCORE GRADIENT (1-10)
  // From terracotta (low) to sage (high)
  // ─────────────────────────────────────────────────────────────────
  energy: {
    1: '#C85A3A',   // Deep terracotta (very low)
    2: '#E2714D',   // Terracotta
    3: '#ED8B6B',   // Light terracotta
    4: '#F5B49D',   // Peach
    5: '#E3CBAA',   // Neutral cream
    6: '#B5D1A4',   // Light sage
    7: '#8FB87A',   // Medium sage
    8: '#6B9B59',   // Sage green
    9: '#537A45',   // Deep sage
    10: '#425F38',  // Forest sage (excellent)
  },

  // ─────────────────────────────────────────────────────────────────
  // HEALTH METRIC COLORS (Nature-inspired)
  // ─────────────────────────────────────────────────────────────────
  health: {
    sleep: '#7C6AA0',      // Soft lavender (night)
    steps: '#6B9B59',      // Sage green (movement)
    heart: '#E45A4A',      // Soft coral (heart)
    hrv: '#D97706',        // Amber (variability)
    calories: '#E2714D',   // Terracotta (energy)
    hydration: '#5B9BD5',  // Soft blue (water)
    mood: '#F59E0B',       // Warm amber
  },

  // ─────────────────────────────────────────────────────────────────
  // GRADIENT PRESETS
  // ─────────────────────────────────────────────────────────────────
  gradients: {
    primary: ['#6B9B59', '#425F38'],      // Sage gradient
    energy: ['#8FB87A', '#537A45'],       // Energy boost
    warmth: ['#E2714D', '#C85A3A'],       // Terracotta warmth
    calm: ['#7C6AA0', '#5B5080'],         // Lavender calm
    sunrise: ['#F5B49D', '#E2714D'],      // Morning energy
    sunset: ['#E2714D', '#7C6AA0'],       // Evening transition
  },

  // ─────────────────────────────────────────────────────────────────
  // SEMANTIC COLORS
  // ─────────────────────────────────────────────────────────────────
  tint: '#6B9B59',
  tabIconDefault: '#B8AFA2',
  tabIconSelected: '#6B9B59',

  // ─────────────────────────────────────────────────────────────────
  // CARD STYLING
  // ─────────────────────────────────────────────────────────────────
  card: {
    background: '#FFFFFF',
    border: '#E8E4DD',
    shadow: 'rgba(42, 38, 33, 0.08)',
  },
};

export default Colors;

// ═══════════════════════════════════════════════════════════════════
// THEME EXPORTS
// ═══════════════════════════════════════════════════════════════════

// Light theme (default - nature-inspired)
export const lightTheme = {
  text: Colors.text.primary,
  textSecondary: Colors.text.secondary,
  background: Colors.background.primary,
  backgroundSecondary: Colors.background.secondary,
  tint: Colors.primary[500],
  tabIconDefault: Colors.neutral[400],
  tabIconSelected: Colors.primary[500],
  border: Colors.neutral[200],
  card: '#FFFFFF',
  shadow: 'rgba(42, 38, 33, 0.08)',
};

// Dark theme (earth-toned)
export const darkTheme = {
  text: Colors.text.inverse,
  textSecondary: Colors.neutral[400],
  background: Colors.background.dark,
  backgroundSecondary: Colors.neutral[800],
  tint: Colors.primary[400],
  tabIconDefault: Colors.neutral[500],
  tabIconSelected: Colors.primary[400],
  border: Colors.neutral[700],
  card: Colors.neutral[800],
  shadow: 'rgba(0, 0, 0, 0.4)',
};
