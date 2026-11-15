import { getSupabaseAdminClient } from '../../adapters/database/supabase.js';
import { logger } from '../../config/logger.js';
import { env, isPlaceholder } from '../../config/env.js';
const TASK_ROUTING = {
    reasoning: { provider: 'openai', model: 'gpt-4o' },
    research: { provider: 'openai', model: 'gpt-4o-mini' },
    classification: { provider: 'openai', model: 'gpt-4o-mini' },
    extraction: { provider: 'openai', model: 'gpt-4o' },
    content: { provider: 'openai', model: 'gpt-4o' },
    coding: { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
    fallback: { provider: 'openai', model: 'gpt-4o-mini' },
};
export function routeModel(taskType) {
    return TASK_ROUTING[taskType] ?? TASK_ROUTING.fallback;
}
export async function callModel(request) {
    const route = routeModel(request.task_type);
    const startTime = Date.now();
    if (isPlaceholder(env.ai.openaiApiKey) && isPlaceholder(env.ai.anthropicApiKey)) {
        logger.warn('AI provider keys are placeholders — returning stub response', { provider: route.provider, model: route.model });
        const stubResponse = {
            content: `[STUB RESPONSE] Model: ${route.model}, Task: ${request.task_type}. Configure API keys to enable real AI responses.`,
            provider: route.provider,
            model: route.model,
            input_tokens: estimateTokens(request.prompt),
            output_tokens: 50,
            latency_ms: Date.now() - startTime,
            cost: 0,
        };
        await recordModelUsage({
            ...request,
            provider: stubResponse.provider,
            model: stubResponse.model,
            input_tokens: stubResponse.input_tokens,
            output_tokens: stubResponse.output_tokens,
            latency_ms: stubResponse.latency_ms,
            cost: stubResponse.cost,
            status: 'STUB',
        });
        return stubResponse;
    }
    try {
        const response = await callProvider(route.provider, route.model, request);
        const latency = Date.now() - startTime;
        await recordModelUsage({
            ...request,
            provider: route.provider,
            model: route.model,
            input_tokens: response.input_tokens,
            output_tokens: response.output_tokens,
            latency_ms: latency,
            cost: response.cost,
            status: 'SUCCESS',
        });
        return { ...response, latency_ms: latency };
    }
    catch (err) {
        const latency = Date.now() - startTime;
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error('Model call failed', { provider: route.provider, model: route.model, error: errMsg });
        await recordModelUsage({
            ...request,
            provider: route.provider,
            model: route.model,
            input_tokens: 0,
            output_tokens: 0,
            latency_ms: latency,
            cost: 0,
            status: 'ERROR',
        });
        throw err;
    }
}
async function callProvider(provider, model, request) {
    if (provider === 'openai') {
        return callOpenAI(model, request);
    }
    if (provider === 'anthropic') {
        return callAnthropic(model, request);
    }
    throw new Error(`Unknown provider: ${provider}`);
}
async function callOpenAI(model, request) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${env.ai.openaiApiKey}`,
        },
        body: JSON.stringify({
            model,
            messages: [
                ...(request.system_prompt ? [{ role: 'system', content: request.system_prompt }] : []),
                { role: 'user', content: request.prompt },
            ],
            max_tokens: request.max_tokens ?? 1000,
            temperature: request.temperature ?? 0.7,
        }),
    });
    if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status} ${await response.text()}`);
    }
    const data = await response.json();
    return {
        content: data.choices[0]?.message?.content ?? '',
        provider: 'openai',
        model,
        input_tokens: data.usage?.prompt_tokens ?? 0,
        output_tokens: data.usage?.completion_tokens ?? 0,
        latency_ms: 0,
        cost: calculateCost('openai', model, data.usage?.prompt_tokens ?? 0, data.usage?.completion_tokens ?? 0),
    };
}
async function callAnthropic(model, request) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ai.anthropicApiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model,
            max_tokens: request.max_tokens ?? 1000,
            system: request.system_prompt ?? undefined,
            messages: [{ role: 'user', content: request.prompt }],
        }),
    });
    if (!response.ok) {
        throw new Error(`Anthropic API error: ${response.status} ${await response.text()}`);
    }
    const data = await response.json();
    return {
        content: data.content[0]?.text ?? '',
        provider: 'anthropic',
        model,
        input_tokens: data.usage?.input_tokens ?? 0,
        output_tokens: data.usage?.output_tokens ?? 0,
        latency_ms: 0,
        cost: calculateCost('anthropic', model, data.usage?.input_tokens ?? 0, data.usage?.output_tokens ?? 0),
    };
}
function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}
function calculateCost(provider, _model, inputTokens, outputTokens) {
    const rates = {
        openai: { input: 0.000005, output: 0.000015 },
        anthropic: { input: 0.000003, output: 0.000015 },
    };
    const rate = rates[provider] ?? rates.openai;
    return Number((inputTokens * rate.input + outputTokens * rate.output).toFixed(6));
}
async function recordModelUsage(input) {
    const supabase = getSupabaseAdminClient();
    const { error } = await supabase.from('model_usage').insert({
        workspace_id: input.workspace_id,
        task_id: input.task_id ?? null,
        agent_run_id: input.agent_run_id ?? null,
        provider: input.provider,
        model: input.model,
        input_tokens: input.input_tokens,
        output_tokens: input.output_tokens,
        latency_ms: input.latency_ms,
        cost: input.cost,
        status: input.status,
    });
    if (error) {
        logger.error('Failed to record model usage', { error: error.message });
    }
}
export async function getModelUsage(workspaceId, limit = 50) {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
        .from('model_usage')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error)
        throw error;
    return (data ?? []);
}
//# sourceMappingURL=model-gateway.js.map