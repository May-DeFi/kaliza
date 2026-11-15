import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { success, created } from '../middleware/response.js';
import { ValidationError } from '../middleware/errors.js';
import { getSupabaseAdminClient } from '../../adapters/database/supabase.js';
const router = Router();
const createFileSchema = z.object({
    workspace_id: z.string().uuid(),
    object_key: z.string().min(1),
    mime_type: z.string().min(1),
    size_bytes: z.number().int().min(0),
    checksum: z.string().optional(),
    source: z.string().default('UPLOAD'),
    access_policy: z.string().default('PRIVATE'),
    task_id: z.string().uuid().optional(),
});
router.post('/', authenticate, async (req, res, next) => {
    try {
        const parsed = createFileSchema.safeParse(req.body);
        if (!parsed.success)
            throw new ValidationError('Invalid input', parsed.error.issues);
        const supabase = getSupabaseAdminClient();
        const { data, error } = await supabase
            .from('file_assets')
            .insert(parsed.data)
            .select('*')
            .single();
        if (error)
            throw error;
        created(res, data);
    }
    catch (err) {
        next(err);
    }
});
router.get('/', authenticate, async (req, res, next) => {
    try {
        const { workspace_id } = req.query;
        if (!workspace_id)
            throw new ValidationError('workspace_id query parameter required');
        const supabase = getSupabaseAdminClient();
        const { data, error } = await supabase
            .from('file_assets')
            .select('*')
            .eq('workspace_id', workspace_id)
            .order('created_at', { ascending: false });
        if (error)
            throw error;
        success(res, data ?? []);
    }
    catch (err) {
        next(err);
    }
});
router.get('/:id', authenticate, async (req, res, next) => {
    try {
        const supabase = getSupabaseAdminClient();
        const { data, error } = await supabase
            .from('file_assets')
            .select('*')
            .eq('id', req.params.id)
            .maybeSingle();
        if (error)
            throw error;
        success(res, data);
    }
    catch (err) {
        next(err);
    }
});
router.delete('/:id', authenticate, async (req, res, next) => {
    try {
        const supabase = getSupabaseAdminClient();
        const { error } = await supabase
            .from('file_assets')
            .delete()
            .eq('id', req.params.id);
        if (error)
            throw error;
        res.status(204).send();
    }
    catch (err) {
        next(err);
    }
});
export default router;
//# sourceMappingURL=file-routes.js.map