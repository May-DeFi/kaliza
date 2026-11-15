const LOG_ORDER = { debug: 0, info: 1, warn: 2, error: 3 };
function currentLevelNum() {
    const level = (process.env.LOG_LEVEL ?? 'info');
    return LOG_ORDER[level] ?? 1;
}
function formatTimestamp() {
    return new Date().toISOString();
}
function log(level, message, meta) {
    if (LOG_ORDER[level] < currentLevelNum())
        return;
    const entry = {
        timestamp: formatTimestamp(),
        level,
        message,
        ...(meta ? { meta } : {}),
    };
    if (level === 'error') {
        console.error(JSON.stringify(entry));
    }
    else if (level === 'warn') {
        console.warn(JSON.stringify(entry));
    }
    else {
        console.log(JSON.stringify(entry));
    }
}
export const logger = {
    debug: (msg, meta) => log('debug', msg, meta),
    info: (msg, meta) => log('info', msg, meta),
    warn: (msg, meta) => log('warn', msg, meta),
    error: (msg, meta) => log('error', msg, meta),
    child: (context) => ({
        debug: (msg, meta) => log('debug', msg, { ...context, ...meta }),
        info: (msg, meta) => log('info', msg, { ...context, ...meta }),
        warn: (msg, meta) => log('warn', msg, { ...context, ...meta }),
        error: (msg, meta) => log('error', msg, { ...context, ...meta }),
    }),
};
//# sourceMappingURL=logger.js.map