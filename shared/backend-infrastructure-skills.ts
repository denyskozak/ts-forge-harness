export const BACKEND_INFRASTRUCTURE_SKILLS = [
  {
    id: 'api-contracts',
    name: 'API Contracts',
    description: 'Design stable, validated and evolvable HTTP and event contracts.',
    tags: ['API', 'Contracts', 'Compatibility'],
    instructions:
      'Treat the API contract as a public boundary. Inspect existing routes, clients and schemas before changing it. Define typed request, response and error shapes; validate untrusted input at the transport boundary and map it into domain values. Keep authorization separate from parsing. Use consistent status codes, pagination, idempotency and versioning rules. Preserve backward compatibility unless the task explicitly permits a breaking change. Update generated or shared client contracts when they exist, and add contract tests for success, invalid input, unauthenticated, unauthorized, conflict and unavailable-dependency responses. Never expose internal errors, database rows or secret fields through the transport contract.',
  },
  {
    id: 'backend-architecture',
    name: 'Backend Architecture',
    description: 'Keep domain behavior, orchestration and infrastructure boundaries coherent.',
    tags: ['Architecture', 'Modules', 'Boundaries'],
    instructions:
      'Prefer a modular monolith until independent deployment or scaling is demonstrated. Organize code by business capability, with domain rules independent from HTTP, GraphQL, RPC, queues and persistence. Put use-case orchestration and transaction boundaries in application services; keep frameworks, databases and external systems behind explicit adapters. Dependencies point toward domain behavior. Keep configuration validated at startup, ownership of mutable state explicit and cross-module calls intentional. Avoid god services, global mutable registries, repositories containing transport validation and generic abstractions without two real consumers. For architectural changes, map callers and data ownership, state the tradeoff, preserve contracts and add boundary tests before moving code.',
  },
  {
    id: 'trpc-patterns',
    name: 'tRPC Patterns',
    description: 'Design typed routers without leaking persistence or authorization concerns.',
    tags: ['tRPC', 'Zod', 'React Query'],
    instructions:
      'Inspect the installed tRPC version, root router, context, middleware and client integration before changing procedures. Group routers by business capability and keep procedures thin: validate inputs with project schemas, establish authentication in context or middleware, authorize the specific resource in the use case and map domain results into stable transport types. Distinguish public and protected procedures explicitly. Do not expose ORM rows, internal errors or server-only dependencies through inferred client types. Use predictable error codes and preserve procedure paths unless a coordinated breaking change is requested. On the client, use the installed query integration, invalidate the narrowest affected cache and handle loading, empty, error and optimistic rollback states. Test input rejection, anonymous and cross-tenant denial, procedure output and the real caller contract.',
  },
  {
    id: 'graphql-patterns',
    name: 'GraphQL Patterns',
    description: 'Build secure schemas, resolvers and data loading at realistic scale.',
    tags: ['GraphQL', 'Schema', 'Resolvers'],
    instructions:
      'Treat the GraphQL schema as a versioned product contract. Inspect the server, schema ownership, code generation and client cache before editing. Model nullability deliberately, prefer additive evolution and deprecate fields before removal. Keep resolvers thin and delegate domain behavior to application services. Authenticate once, authorize every object or operation that crosses a trust boundary and prevent field-level data leaks. Batch and cache request-scoped reads to avoid N+1 queries; never share loaders across users or requests. Bound pagination, query depth, complexity and input sizes, and handle aliases or fragments in cost controls. Give mutations stable payload and error semantics, make retried mutations idempotent where needed and clean up subscriptions. Update generated types and add schema, resolver, authorization, pagination and representative query-cost tests.',
  },
  {
    id: 'service-resilience',
    name: 'Service Resilience',
    description: 'Make background work and integrations safe under retries and partial failure.',
    tags: ['Queues', 'Retries', 'Webhooks'],
    instructions:
      'Design external calls, jobs and webhooks for partial failure. Set explicit timeouts and propagate cancellation. Retry only transient failures with bounded exponential backoff and jitter; cap attempts and surface terminal failure. Make mutating handlers idempotent with stable operation keys, deduplicate deliveries and use transactions or an outbox when state and messages must change together. Bound concurrency, payload size and queue growth. Define dead-letter, replay and reconciliation behavior without silently dropping work. Test duplicate delivery, timeout, cancellation, dependency outage, worker restart and retry exhaustion. Do not add distributed infrastructure when an in-process or database-backed mechanism satisfies the measured requirement.',
  },
  {
    id: 'backend-observability',
    name: 'Backend Observability',
    description: 'Add useful logs, metrics, traces and health signals without leaking data.',
    tags: ['Logs', 'Metrics', 'Tracing'],
    instructions:
      'Instrument behavior that operators need to diagnose, not every implementation detail. Use structured logs with stable event names, severity and request or job correlation IDs. Never log credentials, tokens, cookies, authorization headers, raw personal data or complete request bodies. Define service-level indicators for availability, latency, errors and saturation; keep metric labels bounded. Trace meaningful cross-boundary operations and propagate context through queues and HTTP calls. Separate liveness from readiness and make degraded dependencies visible. Verify redaction and failure-path telemetry in tests. Observability must not change business results or turn a logging outage into an application outage.',
  },
  {
    id: 'terraform-iac',
    name: 'Terraform and IaC',
    description: 'Build reviewable Terraform with safe state, modules and plans.',
    tags: ['Terraform', 'HCL', 'IaC'],
    instructions:
      'Inspect the existing Terraform version constraints, providers, backend, workspaces, modules and naming conventions before editing HCL. Pin compatible provider versions and commit the dependency lock file when the repository does. Keep modules cohesive with typed, validated inputs and intentional outputs; avoid wrappers that only rename resources. Never place credentials or secret values in source, variables, outputs, state examples or logs. Treat remote state and locking as protected infrastructure, and do not change backend configuration casually. Format changed HCL, validate it, and produce a reviewed plan for the intended environment before apply. Read the plan for replacement, deletion, privilege, public exposure and cost changes. Never run apply, destroy, state mutation or import without explicit user authorization and a named environment. Document rollback or recovery limits because many infrastructure changes are not transactionally reversible.',
  },
  {
    id: 'infrastructure-security',
    name: 'Infrastructure Security',
    description: 'Review IAM, network, secrets, encryption and public exposure.',
    tags: ['IAM', 'Network', 'Secrets'],
    instructions:
      'Start from assets, identities, trust boundaries and data flows. Grant least privilege to workload identities and humans; avoid broad wildcards and long-lived static credentials. Keep services private unless public ingress is required, restrict egress where practical and define TLS at every untrusted boundary. Store secrets in an appropriate secret manager, rotate them and prevent them from entering source, state outputs, build artifacts or logs. Enable encryption with explicit key ownership where the threat model requires it. Protect state, audit logs and deployment roles separately from application runtime roles. Review default security groups, bucket or database exposure, metadata access and cross-account trust. Add policy or static checks when the repository supports them, but inspect the real Terraform plan because scanners are incomplete.',
  },
] as const;

export type BackendInfrastructureSkillId = (typeof BACKEND_INFRASTRUCTURE_SKILLS)[number]['id'];

export function backendInfrastructureSkillsForProject(
  prompt: string,
  frameworks: string[],
  paths: string[],
): BackendInfrastructureSkillId[] {
  const selected = new Set<BackendInfrastructureSkillId>();
  const projectHasBackend =
    frameworks.some((item) => /Node|Hono|Express|Fastify|Nest|Next\.js|tRPC/iu.test(item)) ||
    paths.some((item) => /(?:^|\/)(?:api|server|backend|services|workers)(?:\/|$)/iu.test(item));
  const backendRequest =
    /backend|server|api|endpoint|route|webhook|worker|queue|auth|database|бекенд|сервер|апи|эндпоинт|маршрут|вебхук|воркер|очеред|авторизац|баз[аы]\s+данн/iu.test(
      prompt,
    );

  const backendImplementation =
    backendRequest ||
    (projectHasBackend &&
      /add|build|create|change|implement|refactor|добав|созд|собер|измен|реализ|рефактор/iu.test(
        prompt,
      ));

  if (backendImplementation) {
    selected.add('api-contracts');
    selected.add('backend-architecture');
  }

  const trpcProject =
    frameworks.some((item) => /tRPC/iu.test(item)) ||
    paths.some((item) => /(?:^|\/)(?:trpc|routers?)(?:\/|$)|trpc/iu.test(item));
  if (/\btrpc\b/iu.test(prompt) || (trpcProject && backendImplementation)) {
    selected.add('trpc-patterns');
  }

  const graphqlProject =
    frameworks.some((item) => /GraphQL|Apollo|Relay/iu.test(item)) ||
    paths.some((item) => /graphql|(?:^|\/)schema\.(?:graphql|gql)$/iu.test(item));
  if (
    /graphql|apollo|relay|resolver|резолвер|графql/iu.test(prompt) ||
    (graphqlProject && backendImplementation)
  ) {
    selected.add('graphql-patterns');
  }

  if (
    /queue|worker|job|webhook|retry|timeout|idempoten|outbox|cron|очеред|воркер|задач|вебхук|повтор|таймаут|идемпотент/iu.test(
      prompt,
    )
  ) {
    selected.add('service-resilience');
  }

  if (
    /observab|telemetr|logging|metrics|tracing|health.?check|monitor|логир|метрик|трейс|наблюдаем|монитор/iu.test(
      prompt,
    )
  ) {
    selected.add('backend-observability');
  }

  const terraformRequest =
    /terraform|\biac\b|\bhcl\b|tfstate|terragrunt|инфраструктур[аы]\s+как\s+код|терраформ/iu.test(
      prompt,
    ) ||
    paths.some((item) =>
      /(?:^|\/)(?:terraform|infra|infrastructure)(?:\/|$)|\.tf(?:vars)?$/iu.test(item),
    );
  if (terraformRequest) {
    selected.add('terraform-iac');
    selected.add('infrastructure-security');
  } else if (
    /\biam\b|security.group|network.policy|secret.manager|kms|public.exposure|least.privilege|сетев|секрет|публичн.*доступ|минимальн.*привилег/iu.test(
      prompt,
    )
  ) {
    selected.add('infrastructure-security');
  }

  return [...selected];
}
