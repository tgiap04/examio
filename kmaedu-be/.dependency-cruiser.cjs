/**
 * dependency-cruiser rules (phase 10). Run from kmaedu-be:
 *   npx depcruise apps libs --config .dependency-cruiser.cjs
 *
 * Services talk over gRPC/events, never by importing each other's code, and
 * shared libs never depend on a service.
 */
/** Test sources: specs, e2e specs and anything under a test/ directory. */
const TEST_FILES = '(^|/)test/|\\.(spec|e2e-spec)\\.ts$';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
    forbidden: [
        {
            name: 'no-cross-app-import',
            severity: 'error',
            comment:
                'Application code in apps/A must not import apps/B. Use a gRPC contract or an event; share code through libs/.',
            from: { path: '^apps/([^/]+)/', pathNot: TEST_FILES },
            to: { path: '^apps/([^/]+)/', pathNot: '^apps/$1/' },
        },
        {
            name: 'no-cross-app-import-in-tests',
            severity: 'error',
            comment:
                'Cross-service integration harnesses (boot the real auth/gateway, real guard tables) live under the top-level test/cross-app/ package, never inside an app.',
            from: { path: ['^apps/([^/]+)/test/', '^apps/([^/]+)/src/.+\\.spec\\.ts$'] },
            to: { path: '^apps/([^/]+)/', pathNot: '^apps/$1/' },
        },
        {
            name: 'libs-no-apps',
            severity: 'error',
            comment: 'libs/ is below the services: it must never import from apps/.',
            from: { path: '^libs/' },
            to: { path: '^apps/' },
        },
        {
            name: 'libs-no-prisma',
            severity: 'error',
            comment:
                'Each service owns its generated Prisma client (apps/<svc>/src/generated/prisma); shared libs must stay database-free and use structural types.',
            from: { path: '^libs/', pathNot: '\\.(spec|e2e-spec)\\.ts$' },
            to: { path: '(^|/)node_modules/(@prisma/|\\.prisma)(/|$)' },
        },
    ],
    options: {
        doNotFollow: { path: 'node_modules' },
        exclude: { path: '(^|/)(dist|coverage|graphify-out|generated)(/|$)' },
        tsPreCompilationDeps: true,
        tsConfig: { fileName: 'tsconfig.json' },
        enhancedResolveOptions: {
            exportsFields: ['exports'],
            conditionNames: ['import', 'require', 'node', 'default'],
        },
        reporterOptions: { text: { highlightFocused: true } },
    },
};
