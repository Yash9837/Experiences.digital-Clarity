import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    SafeAreaView,
    Alert,
    Dimensions,
    Animated,
    Easing,
    PanResponder,
    ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { saveCheckIn } from '@/lib/checkInService';
import { syncScreenTimeToBackend } from '@/lib/screenTimeService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type CheckInType = 'morning' | 'midday' | 'evening';

// ═══════════════════════════════════════════════════════════════════
// PREMIUM DESIGN SYSTEM
// ═══════════════════════════════════════════════════════════════════
const Theme = {
    bg: '#FAFAF8',
    card: '#FFFFFF',
    primary: '#2D5A27',
    primaryLight: '#E8F0E6',
    primaryMuted: '#7BA375',
    accent: '#D4714C',
    accentLight: '#FDF4F0',
    text: '#1A1A1A',
    textSecondary: '#6B6B6B',
    textMuted: '#9B9B9B',
    border: '#EBEBEB',
    success: '#2D5A27',
    shadow: 'rgba(0, 0, 0, 0.06)',
    shadowDark: 'rgba(0, 0, 0, 0.12)',
};

const Type = {
    h1: { fontSize: 32, fontWeight: '700' as const, letterSpacing: -1, lineHeight: 40 },
    h2: { fontSize: 24, fontWeight: '600' as const, letterSpacing: -0.5, lineHeight: 32 },
    body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 24 },
    bodyMedium: { fontSize: 16, fontWeight: '500' as const, lineHeight: 24 },
    caption: { fontSize: 14, fontWeight: '500' as const, lineHeight: 20 },
    label: { fontSize: 12, fontWeight: '600' as const, letterSpacing: 0.5, textTransform: 'uppercase' as const },
};

// ═══════════════════════════════════════════════════════════════════
// ANIMATED PROGRESS INDICATOR
// ═══════════════════════════════════════════════════════════════════
function ProgressBar({ current, total }: { current: number; total: number }) {
    const width = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(width, {
            toValue: ((current + 1) / total) * 100,
            duration: 400,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
        }).start();
    }, [current, total]);

    return (
        <View style={progressStyles.container}>
            <View style={progressStyles.track}>
                <Animated.View
                    style={[
                        progressStyles.fill,
                        {
                            width: width.interpolate({
                                inputRange: [0, 100],
                                outputRange: ['0%', '100%'],
                            })
                        }
                    ]}
                />
            </View>
            <Text style={progressStyles.text}>{current + 1} of {total}</Text>
        </View>
    );
}

const progressStyles = StyleSheet.create({
    container: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 40 },
    track: { flex: 1, height: 3, backgroundColor: Theme.border, borderRadius: 1.5, overflow: 'hidden' },
    fill: { height: '100%', backgroundColor: Theme.primary, borderRadius: 1.5 },
    text: { ...Type.caption, color: Theme.textMuted, minWidth: 50 },
});

// ═══════════════════════════════════════════════════════════════════
// CIRCULAR GAUGE SLIDER (for Stress Level)
// ═══════════════════════════════════════════════════════════════════
interface CircularSliderProps {
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    label?: string;
    leftLabel?: string;
    rightLabel?: string;
}

function CircularSlider({
    value,
    onChange,
    min = 1,
    max = 10,
    label = '',
    leftLabel = 'Low',
    rightLabel = 'High',
}: CircularSliderProps) {

    // Get color based on value (green to orange for stress)
    const getColor = (val: number) => {
        const normalized = (val - min) / (max - min);
        if (normalized < 0.3) return Theme.primary;
        if (normalized < 0.6) return '#E8A838';
        return Theme.accent;
    };

    // Calculate arc progress percentage
    const progress = ((value - min) / (max - min)) * 100;

    return (
        <View style={circularStyles.container}>
            {/* Main gauge display */}
            <View style={circularStyles.gaugeWrapper}>
                {/* Arc background */}
                <View style={circularStyles.arcBackground}>
                    {/* Segment buttons in arc formation */}
                    <View style={circularStyles.segmentsRow}>
                        {Array.from({ length: 10 }, (_, i) => {
                            const segValue = i + 1;
                            const isActive = segValue <= value;
                            return (
                                <TouchableOpacity
                                    key={i}
                                    style={[
                                        circularStyles.segmentBtn,
                                        isActive && { backgroundColor: getColor(segValue) },
                                    ]}
                                    onPress={() => onChange(segValue)}
                                    activeOpacity={0.7}
                                />
                            );
                        })}
                    </View>
                </View>

                {/* Center display */}
                <View style={circularStyles.centerDisplay}>
                    <Text style={[circularStyles.valueText, { color: getColor(value) }]}>
                        {value}
                    </Text>
                    <Text style={circularStyles.valueLabel}>{label}</Text>
                </View>
            </View>

            {/* Labels */}
            <View style={circularStyles.labels}>
                <Text style={circularStyles.labelText}>{leftLabel}</Text>
                <Text style={circularStyles.labelText}>{rightLabel}</Text>
            </View>

            {/* Number selector row */}
            <View style={circularStyles.numberRow}>
                {Array.from({ length: 10 }, (_, i) => {
                    const num = i + 1;
                    const isSelected = num === value;
                    return (
                        <TouchableOpacity
                            key={num}
                            style={[
                                circularStyles.numberBtn,
                                isSelected && { backgroundColor: getColor(num), borderColor: getColor(num) },
                            ]}
                            onPress={() => onChange(num)}
                        >
                            <Text style={[
                                circularStyles.numberText,
                                isSelected && circularStyles.numberTextActive,
                            ]}>
                                {num}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
}

const circularStyles = StyleSheet.create({
    container: {
        alignItems: 'center',
        marginVertical: 20,
    },
    gaugeWrapper: {
        width: 280,
        height: 160,
        justifyContent: 'flex-end',
        alignItems: 'center',
        marginBottom: 20,
    },
    arcBackground: {
        width: 280,
        height: 140,
        borderTopLeftRadius: 140,
        borderTopRightRadius: 140,
        backgroundColor: Theme.border,
        overflow: 'hidden',
        justifyContent: 'flex-end',
        paddingBottom: 20,
    },
    segmentsRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'flex-end',
        gap: 4,
        paddingHorizontal: 20,
    },
    segmentBtn: {
        width: 20,
        height: 60,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.5)',
    },
    centerDisplay: {
        position: 'absolute',
        bottom: 0,
        alignItems: 'center',
        backgroundColor: Theme.card,
        paddingHorizontal: 32,
        paddingVertical: 16,
        borderRadius: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 4,
    },
    valueText: {
        fontSize: 48,
        fontWeight: '700',
        letterSpacing: -2,
    },
    valueLabel: {
        ...Type.caption,
        color: Theme.textMuted,
        marginTop: 4,
    },
    labels: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
        paddingHorizontal: 24,
        marginBottom: 24,
    },
    labelText: {
        ...Type.caption,
        color: Theme.textMuted,
    },
    numberRow: {
        flexDirection: 'row',
        gap: 6,
    },
    numberBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: Theme.card,
        borderWidth: 1.5,
        borderColor: Theme.border,
        justifyContent: 'center',
        alignItems: 'center',
    },
    numberText: {
        fontSize: 14,
        fontWeight: '600',
        color: Theme.textSecondary,
    },
    numberTextActive: {
        color: '#FFFFFF',
    },
});


// ═══════════════════════════════════════════════════════════════════
// SIMPLE HORIZONTAL SLIDER
// ═══════════════════════════════════════════════════════════════════
interface SimpleSliderProps {
    value: number;
    onChange: (value: number) => void;
    options: Array<{ value: number; emoji: string; label: string }>;
}

function SimpleSlider({ value, onChange, options }: SimpleSliderProps) {
    const sliderWidth = SCREEN_WIDTH - 80;
    const thumbSize = 48;
    const trackPadding = thumbSize / 2;

    const currentIndex = options.findIndex(o => o.value === value);
    const currentOption = options[currentIndex] || options[0];

    const position = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const targetX = (currentIndex / (options.length - 1)) * (sliderWidth - thumbSize);
        Animated.spring(position, {
            toValue: targetX,
            friction: 8,
            tension: 100,
            useNativeDriver: false,
        }).start();
    }, [currentIndex, sliderWidth]);

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: (evt) => {
                handleTouch(evt.nativeEvent.locationX);
            },
            onPanResponderMove: (evt) => {
                handleTouch(evt.nativeEvent.locationX);
            },
        })
    ).current;

    const handleTouch = (x: number) => {
        const adjustedX = Math.max(0, Math.min(sliderWidth, x));
        const normalized = adjustedX / sliderWidth;
        const index = Math.round(normalized * (options.length - 1));
        const newValue = options[index]?.value;
        if (newValue !== undefined && newValue !== value) {
            onChange(newValue);
        }
    };

    return (
        <View style={simpleSliderStyles.container}>
            {/* Current value display */}
            <View style={simpleSliderStyles.display}>
                <Text style={simpleSliderStyles.displayEmoji}>{currentOption.emoji}</Text>
                <Text style={simpleSliderStyles.displayLabel}>{currentOption.label}</Text>
            </View>

            {/* Slider track */}
            <View
                style={[simpleSliderStyles.track, { width: sliderWidth }]}
                {...panResponder.panHandlers}
            >
                {/* Track fill */}
                <Animated.View
                    style={[
                        simpleSliderStyles.trackFill,
                        {
                            width: position.interpolate({
                                inputRange: [0, sliderWidth - thumbSize],
                                outputRange: [thumbSize / 2, sliderWidth - thumbSize / 2],
                            })
                        }
                    ]}
                />

                {/* Option markers */}
                {options.map((option, index) => {
                    const markerX = (index / (options.length - 1)) * (sliderWidth - thumbSize) + thumbSize / 2;
                    const isActive = index <= currentIndex;
                    return (
                        <TouchableOpacity
                            key={option.value}
                            style={[
                                simpleSliderStyles.marker,
                                { left: markerX - 6 },
                                isActive && simpleSliderStyles.markerActive,
                            ]}
                            onPress={() => onChange(option.value)}
                        />
                    );
                })}

                {/* Thumb */}
                <Animated.View
                    style={[
                        simpleSliderStyles.thumb,
                        {
                            left: position,
                            width: thumbSize,
                            height: thumbSize,
                        }
                    ]}
                >
                    <Text style={simpleSliderStyles.thumbEmoji}>{currentOption.emoji}</Text>
                </Animated.View>
            </View>

            {/* Labels */}
            <View style={[simpleSliderStyles.labels, { width: sliderWidth }]}>
                {options.map((option, index) => (
                    <TouchableOpacity
                        key={option.value}
                        onPress={() => onChange(option.value)}
                        style={simpleSliderStyles.labelTouchable}
                    >
                        <Text style={[
                            simpleSliderStyles.labelText,
                            index === currentIndex && simpleSliderStyles.labelTextActive,
                        ]}>
                            {option.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    );
}

const simpleSliderStyles = StyleSheet.create({
    container: { alignItems: 'center', marginVertical: 20 },
    display: {
        alignItems: 'center',
        marginBottom: 32,
        backgroundColor: Theme.card,
        paddingVertical: 24,
        paddingHorizontal: 40,
        borderRadius: 24,
        shadowColor: Theme.shadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 12,
        elevation: 4,
        borderWidth: 1,
        borderColor: Theme.border,
    },
    displayEmoji: { fontSize: 48, marginBottom: 8 },
    displayLabel: { ...Type.h2, color: Theme.primary },
    track: {
        height: 8,
        backgroundColor: Theme.border,
        borderRadius: 4,
        position: 'relative',
        justifyContent: 'center',
    },
    trackFill: {
        position: 'absolute',
        left: 0,
        height: '100%',
        backgroundColor: Theme.primary,
        borderRadius: 4,
    },
    marker: {
        position: 'absolute',
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: Theme.border,
        top: -2,
    },
    markerActive: { backgroundColor: Theme.primary },
    thumb: {
        position: 'absolute',
        borderRadius: 24,
        backgroundColor: Theme.primary,
        justifyContent: 'center',
        alignItems: 'center',
        top: -20,
        shadowColor: Theme.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    thumbEmoji: { fontSize: 24 },
    labels: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 20,
    },
    labelTouchable: { padding: 8 },
    labelText: { ...Type.caption, color: Theme.textMuted, textAlign: 'center' },
    labelTextActive: { color: Theme.primary, fontWeight: '600' },
});

// ═══════════════════════════════════════════════════════════════════
// SCALE SELECTOR (1-10)
// ═══════════════════════════════════════════════════════════════════
interface ScaleSelectorProps {
    value: number | null;
    onChange: (value: number) => void;
    leftLabel?: string;
    rightLabel?: string;
}

function ScaleSelector({ value, onChange, leftLabel = 'Low', rightLabel = 'High' }: ScaleSelectorProps) {
    return (
        <View style={scaleStyles.container}>
            <View style={scaleStyles.grid}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
                    const isSelected = value === num;
                    const isLow = num <= 3;
                    const isHigh = num >= 8;

                    return (
                        <TouchableOpacity
                            key={num}
                            style={[
                                scaleStyles.item,
                                isSelected && scaleStyles.itemSelected,
                                isSelected && isLow && scaleStyles.itemSelectedLow,
                                isSelected && isHigh && scaleStyles.itemSelectedHigh,
                            ]}
                            onPress={() => onChange(num)}
                            activeOpacity={0.7}
                        >
                            <Text style={[
                                scaleStyles.itemText,
                                isSelected && scaleStyles.itemTextSelected,
                            ]}>
                                {num}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
            <View style={scaleStyles.labels}>
                <Text style={scaleStyles.label}>{leftLabel}</Text>
                <Text style={scaleStyles.label}>{rightLabel}</Text>
            </View>
        </View>
    );
}

const scaleStyles = StyleSheet.create({
    container: { width: '100%' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
    item: {
        width: 56,
        height: 56,
        borderRadius: 16,
        backgroundColor: Theme.card,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1.5,
        borderColor: Theme.border,
    },
    itemSelected: { backgroundColor: Theme.primary, borderColor: Theme.primary },
    itemSelectedLow: { backgroundColor: Theme.accent, borderColor: Theme.accent },
    itemSelectedHigh: { backgroundColor: Theme.primary, borderColor: Theme.primary },
    itemText: { fontSize: 18, fontWeight: '600', color: Theme.text },
    itemTextSelected: { color: '#FFFFFF' },
    labels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, paddingHorizontal: 8 },
    label: { ...Type.caption, color: Theme.textMuted },
});

// ═══════════════════════════════════════════════════════════════════
// OPTION CARD (Single Select)
// ═══════════════════════════════════════════════════════════════════
interface OptionCardProps {
    options: Array<{ key: string; emoji: string; label: string; sublabel?: string }>;
    selected: string | null;
    onSelect: (key: string) => void;
    columns?: 2 | 3;
}

function OptionCard({ options, selected, onSelect, columns = 3 }: OptionCardProps) {
    return (
        <View style={[optionStyles.container, columns === 2 && optionStyles.container2Col]}>
            {options.map((option) => {
                const isSelected = selected === option.key;
                return (
                    <TouchableOpacity
                        key={option.key}
                        style={[
                            optionStyles.card,
                            columns === 2 && optionStyles.card2Col,
                            isSelected && optionStyles.cardSelected,
                        ]}
                        onPress={() => onSelect(option.key)}
                        activeOpacity={0.8}
                    >
                        <View style={[optionStyles.emojiContainer, isSelected && optionStyles.emojiContainerSelected]}>
                            <Text style={optionStyles.emoji}>{option.emoji}</Text>
                        </View>
                        <Text style={[optionStyles.label, isSelected && optionStyles.labelSelected]}>
                            {option.label}
                        </Text>
                        {isSelected && (
                            <View style={optionStyles.checkmark}>
                                <Text style={optionStyles.checkmarkText}>✓</Text>
                            </View>
                        )}
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

const optionStyles = StyleSheet.create({
    container: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 },
    container2Col: { gap: 16 },
    card: {
        width: (SCREEN_WIDTH - 80) / 3,
        backgroundColor: Theme.card,
        borderRadius: 20,
        padding: 16,
        alignItems: 'center',
        borderWidth: 1.5,
        borderColor: Theme.border,
        position: 'relative',
    },
    card2Col: { width: (SCREEN_WIDTH - 72) / 2, padding: 20 },
    cardSelected: { backgroundColor: Theme.primaryLight, borderColor: Theme.primary },
    emojiContainer: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: Theme.bg,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
    },
    emojiContainerSelected: { backgroundColor: '#FFFFFF' },
    emoji: { fontSize: 24 },
    label: { ...Type.bodyMedium, color: Theme.text, textAlign: 'center' },
    labelSelected: { color: Theme.primary, fontWeight: '600' },
    checkmark: {
        position: 'absolute',
        top: 10,
        right: 10,
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: Theme.primary,
        justifyContent: 'center',
        alignItems: 'center',
    },
    checkmarkText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
});

// ═══════════════════════════════════════════════════════════════════
// TOGGLE ROW (Yes/No)
// ═══════════════════════════════════════════════════════════════════
interface ToggleRowProps {
    label: string;
    emoji: string;
    value: boolean | null;
    onChange: (value: boolean) => void;
}

function ToggleRow({ label, emoji, value, onChange }: ToggleRowProps) {
    return (
        <View style={toggleStyles.container}>
            <View style={toggleStyles.left}>
                <Text style={toggleStyles.emoji}>{emoji}</Text>
                <Text style={toggleStyles.label}>{label}</Text>
            </View>
            <View style={toggleStyles.buttons}>
                <TouchableOpacity
                    style={[toggleStyles.btn, value === true && toggleStyles.btnYesActive]}
                    onPress={() => onChange(true)}
                >
                    <Text style={[toggleStyles.btnText, value === true && toggleStyles.btnTextActive]}>Yes</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[toggleStyles.btn, value === false && toggleStyles.btnNoActive]}
                    onPress={() => onChange(false)}
                >
                    <Text style={[toggleStyles.btnText, value === false && toggleStyles.btnTextActive]}>No</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const toggleStyles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: Theme.card,
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: Theme.border,
    },
    left: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
    emoji: { fontSize: 24 },
    label: { ...Type.bodyMedium, color: Theme.text, flex: 1 },
    buttons: { flexDirection: 'row', gap: 8 },
    btn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 12, backgroundColor: Theme.bg },
    btnYesActive: { backgroundColor: Theme.primary },
    btnNoActive: { backgroundColor: Theme.accent },
    btnText: { ...Type.bodyMedium, color: Theme.textSecondary },
    btnTextActive: { color: '#FFFFFF' },
});

// ═══════════════════════════════════════════════════════════════════
// SLIDER SELECTOR (for water intake)
// ═══════════════════════════════════════════════════════════════════
interface SliderSelectorProps {
    value: number;
    onChange: (value: number) => void;
    options: Array<{ value: number; label: string }>;
    emoji: string;
}

function SliderSelector({ value, onChange, options, emoji }: SliderSelectorProps) {
    return (
        <View style={sliderStyles.container}>
            <View style={sliderStyles.display}>
                <Text style={sliderStyles.emoji}>{emoji}</Text>
                <Text style={sliderStyles.value}>
                    {options.find(o => o.value === value)?.label || value}
                </Text>
            </View>
            <View style={sliderStyles.options}>
                {options.map((option) => (
                    <TouchableOpacity
                        key={option.value}
                        style={[sliderStyles.option, value === option.value && sliderStyles.optionActive]}
                        onPress={() => onChange(option.value)}
                    >
                        <Text style={[sliderStyles.optionText, value === option.value && sliderStyles.optionTextActive]}>
                            {option.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    );
}

const sliderStyles = StyleSheet.create({
    container: { backgroundColor: Theme.card, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: Theme.border },
    display: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 20 },
    emoji: { fontSize: 32 },
    value: { ...Type.h2, color: Theme.primary },
    options: { flexDirection: 'row', gap: 8 },
    option: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: Theme.bg, alignItems: 'center' },
    optionActive: { backgroundColor: Theme.primary },
    optionText: { ...Type.bodyMedium, color: Theme.textSecondary },
    optionTextActive: { color: '#FFFFFF' },
});

// ═══════════════════════════════════════════════════════════════════
// MAIN CHECK-IN COMPONENT
// ═══════════════════════════════════════════════════════════════════
export default function CheckInModal() {
    const router = useRouter();
    const { type = 'morning' } = useLocalSearchParams<{ type: CheckInType }>();

    return (
        <SafeAreaView style={styles.container}>
            {type === 'morning' && <MorningCheckIn onComplete={() => router.back()} />}
            {type === 'midday' && <MiddayCheckIn onComplete={() => router.back()} />}
            {type === 'evening' && <EveningCheckIn onComplete={() => router.back()} />}
        </SafeAreaView>
    );
}

// ═══════════════════════════════════════════════════════════════════
// MORNING CHECK-IN
// ═══════════════════════════════════════════════════════════════════
function MorningCheckIn({ onComplete }: { onComplete: () => void }) {
    const [step, setStep] = useState(0);
    const [restedScore, setRestedScore] = useState<number | null>(null);
    const [wokeOnTime, setWokeOnTime] = useState<boolean | null>(null);
    const [sleepFeltComplete, setSleepFeltComplete] = useState<boolean | null>(null);
    const [motivation, setMotivation] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const fadeAnim = useRef(new Animated.Value(1)).current;
    const totalSteps = 3;

    const animateTransition = (callback: () => void) => {
        Animated.sequence([
            Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
            Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
        ]).start();
        setTimeout(callback, 150);
    };

    const handleNext = async () => {
        if (step === 0 && restedScore !== null) {
            animateTransition(() => setStep(1));
        } else if (step === 1) {
            animateTransition(() => setStep(2));
        } else if (step === 2 && motivation !== null) {
            setSaving(true);
            const result = await saveCheckIn('morning', {
                rested_score: restedScore,
                woke_on_time: wokeOnTime,
                sleep_felt_complete: sleepFeltComplete,
                motivation_level: motivation,
            });
            setSaving(false);
            if (result.success) {
                Alert.alert('Good morning! ☀️', 'Check-in saved successfully.');
                onComplete();
            } else {
                Alert.alert('Error', result.error || 'Failed to save check-in');
            }
        }
    };

    const canProceed = () => {
        if (step === 0) return restedScore !== null;
        if (step === 1) return true;
        if (step === 2) return motivation !== null;
        return false;
    };

    return (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.wrapper}>
                <View style={styles.header}>
                    <TouchableOpacity style={styles.closeBtn} onPress={onComplete}>
                        <Text style={styles.closeBtnText}>✕</Text>
                    </TouchableOpacity>
                    <View style={styles.titleRow}>
                        <Text style={styles.headerEmoji}>🌅</Text>
                        <Text style={styles.headerTitle}>Morning Check-In</Text>
                    </View>
                </View>

                <ProgressBar current={step} total={totalSteps} />

                <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
                    {step === 0 && (
                        <>
                            <Text style={styles.question}>How rested do you feel?</Text>
                            <Text style={styles.hint}>Rate your energy level right now</Text>
                            <View style={styles.inputArea}>
                                <ScaleSelector
                                    value={restedScore}
                                    onChange={setRestedScore}
                                    leftLabel="Exhausted"
                                    rightLabel="Fully rested"
                                />
                            </View>
                        </>
                    )}

                    {step === 1 && (
                        <>
                            <Text style={styles.question}>About last night</Text>
                            <Text style={styles.hint}>Optional — skip if you prefer</Text>
                            <View style={styles.inputArea}>
                                <ToggleRow emoji="⏰" label="Wake up on time?" value={wokeOnTime} onChange={setWokeOnTime} />
                                <ToggleRow emoji="😴" label="Sleep feel complete?" value={sleepFeltComplete} onChange={setSleepFeltComplete} />
                            </View>
                        </>
                    )}

                    {step === 2 && (
                        <>
                            <Text style={styles.question}>How motivated are you?</Text>
                            <Text style={styles.hint}>To start the day</Text>
                            <View style={styles.inputArea}>
                                <OptionCard
                                    options={[
                                        { key: 'low', emoji: '😴', label: 'Low' },
                                        { key: 'medium', emoji: '😊', label: 'OK' },
                                        { key: 'high', emoji: '🔥', label: 'High' },
                                    ]}
                                    selected={motivation}
                                    onSelect={setMotivation}
                                />
                            </View>
                        </>
                    )}
                </Animated.View>

                <View style={styles.footer}>
                    <TouchableOpacity
                        style={[styles.primaryBtn, (!canProceed() || saving) && styles.primaryBtnDisabled]}
                        onPress={handleNext}
                        disabled={!canProceed() || saving}
                    >
                        <Text style={styles.primaryBtnText}>
                            {saving ? 'Saving...' : step === totalSteps - 1 ? 'Complete' : 'Continue'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        </ScrollView>
    );
}

// ═══════════════════════════════════════════════════════════════════
// MIDDAY CHECK-IN
// ═══════════════════════════════════════════════════════════════════
function MiddayCheckIn({ onComplete }: { onComplete: () => void }) {
    const [step, setStep] = useState(0);
    const [energyLevel, setEnergyLevel] = useState<string | null>(null);
    const [state, setState] = useState<string | null>(null);
    const [stressLevel, setStressLevel] = useState<number>(5);
    const [saving, setSaving] = useState(false);

    const fadeAnim = useRef(new Animated.Value(1)).current;
    const totalSteps = 3;

    const animateTransition = (callback: () => void) => {
        Animated.sequence([
            Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
            Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
        ]).start();
        setTimeout(callback, 150);
    };

    const handleNext = async () => {
        if (step === 0 && energyLevel !== null) {
            animateTransition(() => setStep(1));
        } else if (step === 1 && state !== null) {
            animateTransition(() => setStep(2));
        } else if (step === 2) {
            setSaving(true);
            const result = await saveCheckIn('midday', {
                energy_level: energyLevel,
                state: state,
                stress_level: stressLevel,
            });
            setSaving(false);
            if (result.success) {
                Alert.alert('Done! ☀️', 'Check-in saved successfully.');
                onComplete();
            } else {
                Alert.alert('Error', result.error || 'Failed to save check-in');
            }
        }
    };

    const canProceed = () => {
        if (step === 0) return energyLevel !== null;
        if (step === 1) return state !== null;
        return true;
    };

    return (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.wrapper}>
                <View style={styles.header}>
                    <TouchableOpacity style={styles.closeBtn} onPress={onComplete}>
                        <Text style={styles.closeBtnText}>✕</Text>
                    </TouchableOpacity>
                    <View style={styles.titleRow}>
                        <Text style={styles.headerEmoji}>☀️</Text>
                        <Text style={styles.headerTitle}>Midday Pulse</Text>
                    </View>
                </View>

                <ProgressBar current={step} total={totalSteps} />

                <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
                    {step === 0 && (
                        <>
                            <Text style={styles.question}>How's your energy?</Text>
                            <Text style={styles.hint}>Right now</Text>
                            <View style={styles.inputArea}>
                                <OptionCard
                                    options={[
                                        { key: 'low', emoji: '🔋', label: 'Low' },
                                        { key: 'ok', emoji: '⚡', label: 'OK' },
                                        { key: 'high', emoji: '🚀', label: 'High' },
                                    ]}
                                    selected={energyLevel}
                                    onSelect={setEnergyLevel}
                                />
                            </View>
                        </>
                    )}

                    {step === 1 && (
                        <>
                            <Text style={styles.question}>How are you feeling?</Text>
                            <Text style={styles.hint}>What best describes you right now</Text>
                            <View style={styles.inputArea}>
                                <OptionCard
                                    columns={2}
                                    options={[
                                        { key: 'mentally_drained', emoji: '🧠', label: 'Mentally drained' },
                                        { key: 'physically_tired', emoji: '🏃', label: 'Physically tired' },
                                        { key: 'distracted', emoji: '🎯', label: 'Distracted' },
                                        { key: 'fine', emoji: '✅', label: 'I\'m fine' },
                                    ]}
                                    selected={state}
                                    onSelect={setState}
                                />
                            </View>
                        </>
                    )}

                    {step === 2 && (
                        <>
                            <Text style={styles.question}>Stress level</Text>
                            <Text style={styles.hint}>Drag the dial or tap to select</Text>
                            <View style={styles.inputArea}>
                                <CircularSlider
                                    value={stressLevel}
                                    onChange={setStressLevel}
                                    min={1}
                                    max={10}
                                    label="stress"
                                    leftLabel="😌 Calm"
                                    rightLabel="😫 Stressed"
                                />
                            </View>
                        </>
                    )}
                </Animated.View>

                <View style={styles.footer}>
                    <TouchableOpacity
                        style={[styles.primaryBtn, (!canProceed() || saving) && styles.primaryBtnDisabled]}
                        onPress={handleNext}
                        disabled={!canProceed() || saving}
                    >
                        <Text style={styles.primaryBtnText}>
                            {saving ? 'Saving...' : step === totalSteps - 1 ? 'Complete' : 'Continue'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        </ScrollView>
    );
}

// ═══════════════════════════════════════════════════════════════════
// EVENING CHECK-IN
// ═══════════════════════════════════════════════════════════════════
function EveningCheckIn({ onComplete }: { onComplete: () => void }) {
    const [step, setStep] = useState(0);
    const [drainSource, setDrainSource] = useState<string | null>(null);
    const [comparison, setComparison] = useState<number>(2); // 1=worse, 2=same, 3=better
    const [mood, setMood] = useState<number>(3); // 1-5 scale
    const [stressLevel, setStressLevel] = useState<number>(5);
    const [exerciseDone, setExerciseDone] = useState<boolean | null>(null);
    const [outdoorTime, setOutdoorTime] = useState<boolean | null>(null);
    const [waterGlasses, setWaterGlasses] = useState<number>(4);
    const [lateCaffeine, setLateCaffeine] = useState<boolean | null>(null);
    const [skippedMeals, setSkippedMeals] = useState<boolean | null>(null);
    const [alcohol, setAlcohol] = useState<boolean | null>(null);
    const [saving, setSaving] = useState(false);

    const fadeAnim = useRef(new Animated.Value(1)).current;
    const totalSteps = 5;

    const animateTransition = (callback: () => void) => {
        Animated.sequence([
            Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
            Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
        ]).start();
        setTimeout(callback, 150);
    };

    const handleNext = async () => {
        if (step === 0 && drainSource !== null) {
            animateTransition(() => setStep(1));
        } else if (step === 1) {
            animateTransition(() => setStep(2));
        } else if (step === 2) {
            animateTransition(() => setStep(3));
        } else if (step === 3) {
            animateTransition(() => setStep(4));
        } else if (step === 4) {
            setSaving(true);
            await syncScreenTimeToBackend().catch(() => { });

            // Map comparison value to string
            const comparisonStr = comparison === 1 ? 'worse' : comparison === 2 ? 'same' : 'better';
            // Map mood value to string
            const moodMap: { [key: number]: string } = { 1: 'low', 2: 'stressed', 3: 'okay', 4: 'good', 5: 'great' };

            const result = await saveCheckIn('evening', {
                drain_source: drainSource,
                day_vs_expectations: comparisonStr,
                mood: moodMap[mood] || 'okay',
                stress_level: stressLevel,
                exercise_done: exerciseDone,
                outdoor_time: outdoorTime,
                late_caffeine: lateCaffeine,
                skipped_meals: skippedMeals,
                alcohol: alcohol,
                water_glasses: waterGlasses,
            });
            setSaving(false);
            if (result.success) {
                Alert.alert('Well done! 🌙', 'Evening reflection saved.');
                onComplete();
            } else {
                Alert.alert('Error', result.error || 'Failed to save check-in');
            }
        }
    };

    const canProceed = () => {
        if (step === 0) return drainSource !== null;
        return true;
    };

    // Day comparison options for simple slider
    const dayOptions = [
        { value: 1, emoji: '📉', label: 'Worse' },
        { value: 2, emoji: '➡️', label: 'Same' },
        { value: 3, emoji: '📈', label: 'Better' },
    ];

    // Mood options for simple slider
    const moodOptions = [
        { value: 1, emoji: '😔', label: 'Low' },
        { value: 2, emoji: '😰', label: 'Stressed' },
        { value: 3, emoji: '😐', label: 'Okay' },
        { value: 4, emoji: '🙂', label: 'Good' },
        { value: 5, emoji: '😄', label: 'Great' },
    ];

    return (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.wrapper}>
                <View style={styles.header}>
                    <TouchableOpacity style={styles.closeBtn} onPress={onComplete}>
                        <Text style={styles.closeBtnText}>✕</Text>
                    </TouchableOpacity>
                    <View style={styles.titleRow}>
                        <Text style={styles.headerEmoji}>🌙</Text>
                        <Text style={styles.headerTitle}>Evening Reflection</Text>
                    </View>
                </View>

                <ProgressBar current={step} total={totalSteps} />

                <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
                    {step === 0 && (
                        <>
                            <Text style={styles.question}>What drained you most?</Text>
                            <Text style={styles.hint}>Today</Text>
                            <View style={styles.inputArea}>
                                <OptionCard
                                    columns={2}
                                    options={[
                                        { key: 'poor_sleep', emoji: '😴', label: 'Poor sleep' },
                                        { key: 'work', emoji: '💼', label: 'Work' },
                                        { key: 'physical', emoji: '🏋️', label: 'Physical' },
                                        { key: 'emotional', emoji: '💭', label: 'Emotional' },
                                        { key: 'poor_meals', emoji: '🍽️', label: 'Meals' },
                                        { key: 'nothing', emoji: '✨', label: 'Nothing' },
                                    ]}
                                    selected={drainSource}
                                    onSelect={setDrainSource}
                                />
                            </View>
                        </>
                    )}

                    {step === 1 && (
                        <>
                            <Text style={styles.question}>How was your day?</Text>
                            <Text style={styles.hint}>Compared to what you expected</Text>
                            <View style={styles.inputArea}>
                                <SimpleSlider
                                    value={comparison}
                                    onChange={setComparison}
                                    options={dayOptions}
                                />
                            </View>
                        </>
                    )}

                    {step === 2 && (
                        <>
                            <Text style={styles.question}>How do you feel?</Text>
                            <Text style={styles.hint}>Right now</Text>
                            <View style={styles.inputArea}>
                                <SimpleSlider
                                    value={mood}
                                    onChange={setMood}
                                    options={moodOptions}
                                />
                            </View>
                        </>
                    )}

                    {step === 3 && (
                        <>
                            <Text style={styles.question}>Activity & hydration</Text>
                            <Text style={styles.hint}>Optional</Text>
                            <View style={styles.inputArea}>
                                <ToggleRow emoji="🏃" label="Did you exercise?" value={exerciseDone} onChange={setExerciseDone} />
                                <ToggleRow emoji="🌳" label="Time outdoors?" value={outdoorTime} onChange={setOutdoorTime} />
                                <View style={{ height: 16 }} />
                                <SliderSelector
                                    emoji="💧"
                                    value={waterGlasses}
                                    onChange={setWaterGlasses}
                                    options={[
                                        { value: 0, label: '0-2' },
                                        { value: 4, label: '3-5' },
                                        { value: 6, label: '6-7' },
                                        { value: 8, label: '8+' },
                                    ]}
                                />
                            </View>
                        </>
                    )}

                    {step === 4 && (
                        <>
                            <Text style={styles.question}>Lifestyle habits</Text>
                            <Text style={styles.hint}>Optional</Text>
                            <View style={styles.inputArea}>
                                <ToggleRow emoji="☕" label="Caffeine after 2pm?" value={lateCaffeine} onChange={setLateCaffeine} />
                                <ToggleRow emoji="🍽️" label="Skipped meals?" value={skippedMeals} onChange={setSkippedMeals} />
                                <ToggleRow emoji="🍷" label="Alcohol?" value={alcohol} onChange={setAlcohol} />
                                <Text style={styles.autoNote}>📱 Screen time tracked automatically</Text>
                            </View>
                        </>
                    )}
                </Animated.View>

                <View style={styles.footer}>
                    <TouchableOpacity
                        style={[styles.primaryBtn, (!canProceed() || saving) && styles.primaryBtnDisabled]}
                        onPress={handleNext}
                        disabled={!canProceed() || saving}
                    >
                        <Text style={styles.primaryBtnText}>
                            {saving ? 'Saving...' : step === totalSteps - 1 ? 'Complete' : 'Continue'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        </ScrollView>
    );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN STYLES
// ═══════════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Theme.bg },
    scrollView: { flex: 1 },
    scrollContent: { flexGrow: 1 },
    wrapper: { flex: 1, paddingHorizontal: 24, paddingTop: 16 },
    header: { marginBottom: 24 },
    closeBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: Theme.card,
        justifyContent: 'center',
        alignItems: 'center',
        alignSelf: 'flex-end',
        borderWidth: 1,
        borderColor: Theme.border,
    },
    closeBtnText: { fontSize: 18, color: Theme.textMuted },
    titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 8 },
    headerEmoji: { fontSize: 36 },
    headerTitle: { ...Type.h1, color: Theme.text },
    content: { flex: 1 },
    question: { ...Type.h2, color: Theme.text, textAlign: 'center', marginBottom: 8 },
    hint: { ...Type.body, color: Theme.textMuted, textAlign: 'center', marginBottom: 32 },
    inputArea: { flex: 1 },
    autoNote: { ...Type.caption, color: Theme.textMuted, textAlign: 'center', marginTop: 24 },
    footer: { paddingVertical: 24 },
    primaryBtn: { backgroundColor: Theme.primary, paddingVertical: 18, borderRadius: 16, alignItems: 'center' },
    primaryBtnDisabled: { backgroundColor: Theme.border },
    primaryBtnText: { ...Type.bodyMedium, color: '#FFFFFF', fontWeight: '600' },
});
