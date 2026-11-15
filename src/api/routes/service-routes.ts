import { Router } from 'express';
import { getSupabaseAdminClient } from '../../adapters/database/supabase.js';
import { authenticate } from '../middleware/auth.js';
import { success } from '../middleware/response.js';

const router = Router();

router.get('/', authenticate, async (_req, res, next) => {
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('service_registry')
      .select('*')
      .eq('available', true)
      .order('created_at', { ascending: true });

    if (error) throw error;
    success(res, data ?? []);
  } catch (err) {
    next(err);
  }
});

router.get('/:serviceId', authenticate, async (req, res, next) => {
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('service_registry')
      .select('*')
      .eq('service_id', req.params.serviceId)
      .maybeSingle();

    if (error) throw error;
    success(res, data);
  } catch (err) {
    next(err);
  }
});

export default router;
