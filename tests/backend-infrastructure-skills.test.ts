import test from 'node:test';
import assert from 'node:assert/strict';
import { settingsSchema } from '../electron/schema';
import {
  BACKEND_INFRASTRUCTURE_SKILLS,
  backendInfrastructureSkillsForProject,
} from '../shared/backend-infrastructure-skills';
import { DEFAULT_SETTINGS, SKILLS } from '../shared/types';

test('backend and infrastructure skills are available without changing defaults', () => {
  for (const skill of BACKEND_INFRASTRUCTURE_SKILLS) {
    assert.ok(SKILLS.some((candidate) => candidate.id === skill.id));
    assert.ok(
      settingsSchema.parse({ ...DEFAULT_SETTINGS, skills: [skill.id] }).skills.includes(skill.id),
    );
  }
  assert.deepEqual(settingsSchema.parse(DEFAULT_SETTINGS).skills, DEFAULT_SETTINGS.skills);
});

test('Terraform work selects IaC and infrastructure security guidance', () => {
  assert.deepEqual(
    backendInfrastructureSkillsForProject(
      'Create Terraform modules for AWS with remote state and least-privilege IAM',
      ['Node.js'],
      ['apps/api/src/server.ts', 'infra/main.tf'],
    ),
    ['api-contracts', 'backend-architecture', 'terraform-iac', 'infrastructure-security'],
  );
});

test('webhook worker work selects contracts and resilience without Terraform', () => {
  assert.deepEqual(
    backendInfrastructureSkillsForProject(
      'Implement an idempotent webhook worker with bounded retries',
      ['Hono'],
      ['apps/api/src/workers/webhook.ts'],
    ),
    ['api-contracts', 'backend-architecture', 'service-resilience'],
  );
});

test('observability guidance is selected for backend telemetry work', () => {
  assert.deepEqual(
    backendInfrastructureSkillsForProject(
      'Add structured logging, metrics, tracing and readiness checks',
      ['Fastify'],
      ['services/api/src/index.ts'],
    ),
    ['api-contracts', 'backend-architecture', 'backend-observability'],
  );
});

test('tRPC work selects architecture and typed router guidance', () => {
  assert.deepEqual(
    backendInfrastructureSkillsForProject(
      'Add a protected tRPC procedure and update its React Query caller',
      ['tRPC', 'React'],
      ['apps/api/src/trpc/routers/account.ts', 'apps/web/src/account.tsx'],
    ),
    ['api-contracts', 'backend-architecture', 'trpc-patterns'],
  );
});

test('GraphQL work selects architecture and GraphQL schema guidance', () => {
  assert.deepEqual(
    backendInfrastructureSkillsForProject(
      'Implement a paginated GraphQL resolver without N+1 queries',
      ['Apollo GraphQL'],
      ['apps/api/src/graphql/schema.graphql', 'apps/api/src/graphql/resolvers.ts'],
    ),
    ['api-contracts', 'backend-architecture', 'graphql-patterns'],
  );
});

test('ordinary React UI work receives no backend infrastructure guidance', () => {
  assert.deepEqual(
    backendInfrastructureSkillsForProject(
      'Polish the product card layout',
      ['React'],
      ['apps/web/src/ProductCard.tsx'],
    ),
    [],
  );
});
