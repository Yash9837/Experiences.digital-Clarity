import { Router } from 'express';

const router = Router();

// Auth routes are primarily handled by Supabase client-side
// This is for any server-side auth operations if needed

router.post('/verify', async (req, res) => {
    // Token verification endpoint if needed
    res.json({ message: 'Auth endpoint - use Supabase client-side auth' });
});

export default router;
