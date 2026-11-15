import type { Workspace, Organization, Membership, ServiceEntitlement } from '../../contracts/types.js';
export declare function createOrganization(name: string, ownerId: string): Promise<Organization>;
export declare function createWorkspace(input: {
    tenant_id?: string;
    name: string;
    type: string;
    owner_user_id: string;
}): Promise<{
    workspace: Workspace;
    membership: Membership;
}>;
export declare function createIndividualWorkspace(userId: string, name: string): Promise<{
    workspace: Workspace;
    membership: Membership;
}>;
export declare function createBusinessWorkspace(input: {
    orgName: string;
    ownerId: string;
    workspaceName?: string;
}): Promise<{
    organization: Organization;
    workspace: Workspace;
    membership: Membership;
}>;
export declare function getWorkspace(id: string): Promise<Workspace>;
export declare function listUserWorkspaces(userId: string): Promise<Workspace[]>;
export declare function getWorkspaceMemberships(workspaceId: string): Promise<Membership[]>;
export declare function addMember(input: {
    workspace_id: string;
    user_id: string;
    role: string;
    permissions?: string[];
}): Promise<Membership>;
export declare function updateMemberRole(workspaceId: string, userId: string, role: string): Promise<Membership>;
export declare function removeMember(workspaceId: string, userId: string): Promise<void>;
export declare function getMembership(workspaceId: string, userId: string): Promise<Membership | null>;
export declare function ensureMemberRole(workspaceId: string, userId: string, requiredRoles: string[]): Promise<Membership>;
export declare function grantServiceEntitlement(input: {
    workspace_id: string;
    service_id: string;
    plan: string;
    limits?: Record<string, unknown>;
}): Promise<ServiceEntitlement>;
export declare function getWorkspaceEntitlements(workspaceId: string): Promise<ServiceEntitlement[]>;
export declare function checkServiceEntitlement(workspaceId: string, serviceId: string): Promise<ServiceEntitlement>;
//# sourceMappingURL=workspace-service.d.ts.map