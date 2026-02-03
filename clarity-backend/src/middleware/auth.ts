import { Request, Response, NextFunction } from 'express';
import { supabase } from '../utils/supabase';

export interface AuthenticatedRequest extends Request {
    user?: {
        id: string;
        email: string;
    };
}

export async function authenticateToken(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
) {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }

        req.user = {
            id: user.id,
            email: user.email || '',
        };

        next();
    } catch (error) {
        console.error('Auth error:', error);
        return res.status(500).json({ error: 'Authentication failed' });
    }
}

// Optional auth - doesn't require token but attaches user if present
export async function optionalAuth(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
) {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
        try {
            const { data: { user } } = await supabase.auth.getUser(token);
            if (user) {
                req.user = {
                    id: user.id,
                    email: user.email || '',
                };
            }
        } catch (error) {
            // Ignore auth errors for optional auth
        }
    }

    next();
}
