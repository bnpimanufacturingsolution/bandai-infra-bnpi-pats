import { AsyncLocalStorage } from "async_hooks";

type TenantContextStore = {
	organizationId?: string;
	userId?: string;
};

export const tenantContext = new AsyncLocalStorage<TenantContextStore>();

export function getOrganizationId(): string | undefined {
	return tenantContext.getStore()?.organizationId;
}

export function runWithTenantContext<T>(store: TenantContextStore, callback: () => T): T {
	return tenantContext.run(store, callback);
}
