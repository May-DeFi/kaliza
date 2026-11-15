import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { API_PREFIX } from '../config/constants.js';
import { logger } from '../config/logger.js';
import { requestId } from './middleware/request-id.js';
import { errorHandler } from './middleware/error-handler.js';
import userRoutes from './routes/user-routes.js';
import workspaceRoutes from './routes/workspace-routes.js';
import serviceRoutes from './routes/service-routes.js';
import conversationRoutes from './routes/conversation-routes.js';
import taskRoutes from './routes/task-routes.js';
import fileRoutes from './routes/file-routes.js';
import whatsappWebhookRoutes from './routes/whatsapp-webhook-routes.js';
import approvalRoutes from './routes/approval-routes.js';
import toolRoutes from './routes/tool-routes.js';
import agentRunRoutes from './routes/agent-run-routes.js';
import sandboxRoutes from './routes/sandbox-routes.js';
import usageRoutes from './routes/usage-routes.js';
import integrationRoutes from './routes/integration-routes.js';
import notificationRoutes from './routes/notification-routes.js';
import businessGrowthRoutes from './routes/business-growth-routes.js';
import adminRoutes from './routes/admin-routes.js';
import billingRoutes from './routes/billing-routes.js';
const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestId);
if (env.server.nodeEnv !== 'test') {
    app.use(morgan('combined'));
}
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests, please try again later' },
    },
});
app.use(API_PREFIX, apiLimiter);
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
app.use(`${API_PREFIX}/users`, userRoutes);
app.use(`${API_PREFIX}/workspaces`, workspaceRoutes);
app.use(`${API_PREFIX}/services`, serviceRoutes);
app.use(`${API_PREFIX}/conversations`, conversationRoutes);
app.use(`${API_PREFIX}/tasks`, taskRoutes);
app.use(`${API_PREFIX}/files`, fileRoutes);
app.use(`${API_PREFIX}/whatsapp`, whatsappWebhookRoutes);
app.use(`${API_PREFIX}/approvals`, approvalRoutes);
app.use(`${API_PREFIX}/tools`, toolRoutes);
app.use(`${API_PREFIX}/agent-runs`, agentRunRoutes);
app.use(`${API_PREFIX}/sandboxes`, sandboxRoutes);
app.use(`${API_PREFIX}/usage`, usageRoutes);
app.use(`${API_PREFIX}/integrations`, integrationRoutes);
app.use(`${API_PREFIX}/notifications`, notificationRoutes);
app.use(`${API_PREFIX}/business-growth`, businessGrowthRoutes);
app.use(`${API_PREFIX}/admin`, adminRoutes);
app.use(`${API_PREFIX}/billing`, billingRoutes);
app.use((_req, res) => {
    res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Route not found' },
    });
});
app.use(errorHandler);
const PORT = env.server.port;
if (env.server.nodeEnv !== 'test') {
    app.listen(PORT, () => {
        logger.info(`Kaliza API server started`, { port: PORT, env: env.server.nodeEnv });
    });
}
export default app;
//# sourceMappingURL=index.js.map