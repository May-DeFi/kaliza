import type { User } from '../../contracts/types.js';
export declare function findUserByAuthSubject(authSubject: string): Promise<User | null>;
export declare function findUserByPhone(phone: string): Promise<User | null>;
export declare function findUserByEmail(email: string): Promise<User | null>;
export declare function getUser(id: string): Promise<User>;
export declare function createUser(input: {
    auth_subject?: string;
    email?: string;
    phone?: string;
    full_name?: string;
}): Promise<User>;
export declare function updateUser(id: string, updates: Partial<Pick<User, 'full_name' | 'phone' | 'email' | 'status' | 'profile'>>): Promise<User>;
export declare function findOrCreateUserByPhone(phone: string, fullName?: string): Promise<User>;
//# sourceMappingURL=user-service.d.ts.map