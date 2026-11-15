export declare const env: {
    readonly supabase: {
        readonly url: string;
        readonly anonKey: string;
        readonly serviceRoleKey: string;
        readonly dbUrl: string;
    };
    readonly server: {
        readonly port: number;
        readonly nodeEnv: string;
        readonly logLevel: string;
    };
    readonly auth: {
        readonly jwtSecret: string;
    };
    readonly meta: {
        readonly appId: string;
        readonly appSecret: string;
        readonly whatsappPhoneNumberId: string;
        readonly whatsappVerifyToken: string;
    };
    readonly google: {
        readonly clientId: string;
        readonly clientSecret: string;
        readonly redirectUri: string;
    };
    readonly daytona: {
        readonly apiUrl: string;
        readonly apiKey: string;
    };
    readonly ai: {
        readonly openaiApiKey: string;
        readonly anthropicApiKey: string;
    };
    readonly storage: {
        readonly s3Endpoint: string;
        readonly s3AccessKeyId: string;
        readonly s3SecretAccessKey: string;
        readonly s3Bucket: string;
        readonly s3Region: string;
    };
    readonly encryption: {
        readonly key: string;
    };
};
export type Env = typeof env;
export declare function isPlaceholder(value: string): boolean;
//# sourceMappingURL=env.d.ts.map