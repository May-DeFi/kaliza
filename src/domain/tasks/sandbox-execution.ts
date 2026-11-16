import { getSandbox, executeInSandbox } from '../../domain/tasks/sandbox-manager.js';
import { getDaytonaAdapter } from '../../adapters/daytona/daytona-adapter.js';
import { getSupabaseAdminClient } from '../../adapters/database/supabase.js';
import { logger } from '../../config/logger.js';

export interface SandboxExecutionResult {
  exit_code: number;
  stdout: string;
  stderr: string;
  duration_ms: number;
  files_read?: string[];
  files_written?: string[];
}

export async function runAgentScript(input: {
  sandbox_id: string;
  script: string;
  language: 'python' | 'bash' | 'node';
  timeout_ms?: number;
  env?: Record<string, string>;
}): Promise<SandboxExecutionResult> {
  const sandbox = await getSandbox(input.sandbox_id);
  const daytona = getDaytonaAdapter();

  const ext = input.language === 'python' ? 'py' : input.language === 'node' ? 'js' : 'sh';
  const runner = input.language === 'python' ? 'python3' : input.language === 'node' ? 'node' : 'bash';
  const scriptPath = `/tmp/agent_script.${ext}`;

  const writeCmd = `cat > ${scriptPath} << 'KALIZA_EOF'\n${input.script}\nKALIZA_EOF`;
  const execCmd = `${runner} ${scriptPath}`;

  const envPrefix = Object.entries(input.env ?? {})
    .map(([k, v]) => `${k}="${v.replace(/"/g, '\\"')}"`)
    .join(' ');

  const fullCommand = `${writeCmd} && ${envPrefix} ${execCmd}`;

  const result = await executeInSandbox({
    sandbox_id: input.sandbox_id,
    command: fullCommand,
    timeout_ms: input.timeout_ms ?? 60000,
  });

  logger.info('Agent script executed in sandbox', {
    sandboxId: input.sandbox_id,
    language: input.language,
    exitCode: result.exit_code,
    durationMs: result.duration_ms,
  });

  return result;
}

export async function uploadFileToSandbox(input: {
  sandbox_id: string;
  path: string;
  content: string;
}): Promise<void> {
  const sandbox = await getSandbox(input.sandbox_id);
  const dir = input.path.split('/').slice(0, -1).join('/');
  const mkdirCmd = dir ? `mkdir -p ${dir}` : 'true';
  const writeCmd = `${mkdirCmd} && cat > ${input.path} << 'KALIZA_EOF'\n${input.content}\nKALIZA_EOF`;

  await executeInSandbox({
    sandbox_id: input.sandbox_id,
    command: writeCmd,
  });
}

export async function readFileFromSandbox(input: {
  sandbox_id: string;
  path: string;
}): Promise<string> {
  await getSandbox(input.sandbox_id);
  const result = await executeInSandbox({
    sandbox_id: input.sandbox_id,
    command: `cat ${input.path}`,
  });
  return result.stdout;
}

export async function installPackages(input: {
  sandbox_id: string;
  packages: string[];
  manager: 'pip' | 'npm' | 'apt';
}): Promise<SandboxExecutionResult> {
  const cmds: Record<string, string> = {
    pip: `pip install --quiet ${input.packages.join(' ')}`,
    npm: `npm install --silent ${input.packages.join(' ')}`,
    apt: `apt-get update -qq && apt-get install -y -qq ${input.packages.join(' ')}`,
  };

  return executeInSandbox({
    sandbox_id: input.sandbox_id,
    command: cmds[input.manager],
    timeout_ms: 120000,
  });
}

export async function setSandboxEnvVar(input: {
  sandbox_id: string;
  key: string;
  value: string;
}): Promise<void> {
  await getSandbox(input.sandbox_id);
  await executeInSandbox({
    sandbox_id: input.sandbox_id,
    command: `echo 'export ${input.key}="${input.value.replace(/"/g, '\\"')}"' >> /tmp/.kaliza-env && source /tmp/.kaliza-env`,
  });
}

export async function getWorkspaceScopedCredentials(workspaceId: string, taskId: string): Promise<Record<string, string>> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('integration_connections')
    .select('provider, encrypted_tokens, scopes')
    .eq('workspace_id', workspaceId)
    .eq('status', 'ACTIVE');

  if (error) throw error;

  const credentials: Record<string, string> = {};

  for (const conn of data ?? []) {
    const provider = conn.provider as string;
    const tokens = conn.encrypted_tokens as Record<string, string>;
    for (const [key, value] of Object.entries(tokens)) {
      credentials[`${provider.toUpperCase()}_${key.toUpperCase()}`] = value;
    }
  }

  logger.info('Loaded scoped credentials for sandbox', {
    workspaceId, taskId,
    providerCount: (data ?? []).length,
    keyCount: Object.keys(credentials).length,
  });

  return credentials;
}
