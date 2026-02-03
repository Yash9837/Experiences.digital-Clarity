import { Platform } from 'react-native';

// Android emulator uses 10.0.2.2 to reach host machine
const getApiUrl = () => {
    if (Platform.OS === 'android' && !process.env.EXPO_PUBLIC_API_URL?.includes('10.0.2.2')) {
        return 'http://10.0.2.2:3000/api';
    }
    return process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';
};

const API_BASE_URL = getApiUrl();

interface RequestOptions {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: Record<string, unknown>;
    token?: string;
}

class ApiClient {
    private baseUrl: string;
    private token: string | null = null;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
    }

    setToken(token: string | null) {
        this.token = token;
    }

    private async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
        const { method = 'GET', body, token } = options;
        const authToken = token || this.token;

        const headers: HeadersInit = {
            'Content-Type': 'application/json',
        };

        if (authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;
        }

        const config: RequestInit = {
            method,
            headers,
        };

        if (body) {
            config.body = JSON.stringify(body);
        }

        const response = await fetch(`${this.baseUrl}${endpoint}`, config);

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Request failed' }));
            throw new Error(error.message || `HTTP error! status: ${response.status}`);
        }

        return response.json();
    }

    // Check-ins
    async createCheckIn(type: string, data: Record<string, unknown>) {
        return this.request('/check-ins', {
            method: 'POST',
            body: { type, data },
        });
    }

    async getCheckIns(date?: string) {
        const query = date ? `?date=${date}` : '';
        return this.request(`/check-ins${query}`);
    }

    async getTodayCheckIns() {
        const today = new Date().toISOString().split('T')[0];
        return this.getCheckIns(today);
    }

    // Energy Score
    async getEnergyScore(date?: string) {
        const query = date ? `?date=${date}` : '';
        return this.request(`/energy${query}`);
    }

    async getTodayEnergy() {
        const today = new Date().toISOString().split('T')[0];
        return this.getEnergyScore(today);
    }

    // Feedback
    async submitFeedback(energyScoreId: string, matched: boolean) {
        return this.request('/feedback', {
            method: 'POST',
            body: { energy_score_id: energyScoreId, matched },
        });
    }

    // Health Data
    async syncHealthData(type: string, data: Record<string, unknown>, sourceDate: string) {
        return this.request('/health-data', {
            method: 'POST',
            body: { type, data, source_date: sourceDate },
        });
    }

    // User Profile
    async getProfile() {
        return this.request('/user/profile');
    }

    async updateProfile(data: Record<string, unknown>) {
        return this.request('/user/profile', {
            method: 'PUT',
            body: data,
        });
    }

    async completeOnboarding() {
        return this.request('/user/onboarding', {
            method: 'POST',
        });
    }

    // Weekly Insights
    async getWeeklyInsights() {
        return this.request('/insights/weekly');
    }
}

export const api = new ApiClient(API_BASE_URL);
export default api;
