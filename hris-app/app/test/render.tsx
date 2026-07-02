import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, type MemoryRouterProps } from "react-router";
import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

/**
 * Creates a fresh QueryClient suitable for tests.
 * Disables retries so failures surface immediately.
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

export interface RenderWithProvidersOptions
  extends Omit<RenderOptions, "wrapper"> {
  /** Props forwarded to MemoryRouter (e.g. initialEntries) */
  routerProps?: Partial<MemoryRouterProps>;
  /** Provide a pre-created client if you need to inspect cache between renders */
  queryClient?: QueryClient;
}

/**
 * Render helper that supplies the minimal providers required by most components:
 * - TanStack QueryClientProvider (fresh client, no retries)
 * - react-router MemoryRouter
 *
 * Callers are still responsible for vi.mock'ing hooks and services (useAuth, use* data hooks, etc.)
 * to keep tests deterministic and offline.
 *
 * Example:
 *   vi.mock("~/lib/hooks/use-auth", () => ({ useAuth: () => ({ user: { ... } }) }));
 *   const result = renderWithProviders(<MyComponent />);
 */
export function renderWithProviders(
  ui: ReactElement,
  options: RenderWithProvidersOptions = {}
): RenderResult {
  const {
    routerProps = { initialEntries: ["/"] },
    queryClient = createTestQueryClient(),
    ...renderOptions
  } = options;

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter {...routerProps}>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}
