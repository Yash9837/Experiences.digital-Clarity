import { supabase } from './supabase';
import { Platform } from 'react-native';

// For iOS simulator, localhost works. For Android emulator, use 10.0.2.2
const getBaseUrl = () => {
    if (process.env.EXPO_PUBLIC_API_URL) {
        return process.env.EXPO_PUBLIC_API_URL;
    }
    // Android emulator uses 10.0.2.2 to reach host machine
    if (Platform.OS === 'android') {
        return 'http://10.0.2.2:3000/api';
    }
    return 'http://localhost:3000/api';
};

const API_URL = getBaseUrl();

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

interface ChatResponse {
    response: string;
    healthContext?: {
        energyScore?: number;
        sleepDuration?: number;
    };
}

interface InsightsResponse {
    insights: string;
    healthContext?: Record<string, unknown>;
}

interface WeeklySummaryResponse {
    summary: string;
    stats?: {
        avgEnergy: string;
        avgSleep: string;
        avgSteps: number;
        daysTracked: number;
    };
}

// Get auth header
async function getAuthHeader(): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
        throw new Error('Not authenticated');
    }
    return {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
    };
}

// Chat with AI health copilot
export async function chatWithAI(
    message: string,
    history: ChatMessage[] = []
): Promise<ChatResponse> {
    const headers = await getAuthHeader();

    console.log('🤖 Calling AI chat at:', `${API_URL}/ai/chat`);
    
    const response = await fetch(`${API_URL}/ai/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message, history }),
    });

    if (!response.ok) {
        const text = await response.text();
        console.error('AI API error response:', text);
        try {
            const error = JSON.parse(text);
            throw new Error(error.error || 'Failed to get AI response');
        } catch {
            throw new Error(`API error: ${response.status} - ${text.substring(0, 100)}`);
        }
    }

    return response.json();
}

// Get AI-generated health insights
export async function getAIInsights(): Promise<InsightsResponse> {
    const headers = await getAuthHeader();

    const response = await fetch(`${API_URL}/ai/insights`, {
        method: 'GET',
        headers,
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get AI insights');
    }

    return response.json();
}

// Get weekly AI summary
export async function getWeeklySummary(): Promise<WeeklySummaryResponse> {
    const headers = await getAuthHeader();

    const response = await fetch(`${API_URL}/ai/weekly-summary`, {
        method: 'GET',
        headers,
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get weekly summary');
    }

    return response.json();
}

// Quick prompts for the AI
export const quickPrompts = [
    {
        id: 'energy',
        label: '⚡ Why is my energy low?',
        prompt: 'Why might my energy be low today based on my recent data?',
    },
    {
        id: 'sleep',
        label: '😴 How can I sleep better?',
        prompt: 'Based on my sleep patterns, what can I do to improve my sleep quality?',
    },
    {
        id: 'productivity',
        label: '🎯 Peak productivity tips',
        prompt: 'When am I most productive based on my data? How can I optimize my schedule?',
    },
    {
        id: 'stress',
        label: '🧘 Manage stress',
        prompt: 'What patterns in my data might indicate stress? How can I manage it better?',
    },
    {
        id: 'exercise',
        label: '🏃 Exercise suggestions',
        prompt: 'Based on my activity levels and energy, what exercise routine would work best for me?',
    },
    {
        id: 'nutrition',
        label: '🥗 Nutrition tips',
        prompt: 'How might my eating patterns be affecting my energy? Any suggestions?',
    },
];

export { ChatMessage };



