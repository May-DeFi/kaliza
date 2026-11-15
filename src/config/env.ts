import dotenv from 'dotenv';

dotenv.config();

function required(key: string, fallback: string): string {
  const value = process.env[key] ?? fallback;
  return value;
}

export const env = {
  supabase: {
    url: required('SUPABASE_URL', ''),
    anonKey: required('SUPABASE_ANON_KEY', ''),
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY', ''),
    dbUrl: required('SUPABASE_DB_URL', ''),
  },
  server: {
    port: parseInt(required('PORT', '3000'), 10),
    nodeEnv: required('NODE_ENV', 'development'),
    logLevel: required('LOG_LEVEL', 'info'),
  },
  auth: {
    jwtSecret: required('JWT_SECRET', 'change-me-in-production'),
  },
  meta: {
    appId: required('META_APP_ID', 'placeholder_meta_app_id'),
    appSecret: required('META_APP_SECRET', 'placeholder_meta_app_secret'),
    whatsappPhoneNumberId: required('META_WHATSAPP_PHONE_NUMBER_ID', 'placeholder_phone_number_id'),
    whatsappVerifyToken: required('META_WHATSAPP_VERIFY_TOKEN', 'placeholder_verify_token'),
  },
  google: {
    clientId: required('GOOGLE_CLIENT_ID', 'placeholder_google_client_id'),
    clientSecret: required('GOOGLE_CLIENT_SECRET', 'placeholder_google_client_secret'),
    redirectUri: required('GOOGLE_REDIRECT_URI', 'http://localhost:3000/api/v1/integrations/google/callback'),
  },
  daytona: {
    apiUrl: required('DAYTONA_API_URL', 'https://app.daytona.ai'),
    apiKey: required('DAYTONA_API_KEY', 'placeholder_daytona_api_key'),
  },
  ai: {
    openaiApiKey: required('OPENAI_API_KEY', 'placeholder_openai_api_key'),
    anthropicApiKey: required('ANTHROPIC_API_KEY', 'placeholder_anthropic_api_key'),
  },
  storage: {
    s3Endpoint: required('S3_ENDPOINT', ''),
    s3AccessKeyId: required('S3_ACCESS_KEY_ID', ''),
    s3SecretAccessKey: required('S3_SECRET_ACCESS_KEY', ''),
    s3Bucket: required('S3_BUCKET', 'kaliza-files'),
    s3Region: required('S3_REGION', 'auto'),
  },
  encryption: {
    key: required('ENCRYPTION_KEY', 'placeholder_encryption_key_generate_one_in_production'),
  },
} as const;

export type Env = typeof env;

export function isPlaceholder(value: string): boolean {
  return value.startsWith('placeholder_') || value === '';
}
