import { taskPipelineForPrompt } from './checkpoint';
import type { TaskRecord } from './task';

export const TASK_PLANNING_INSTRUCTIONS = `Plan from the original user request and repository evidence before proposing changes.
Keep the original goal intact. Separate requested behavior, constraints, explicit exclusions, assumptions and unknowns.
Use 2–6 concrete steps for multi-part work; one step is enough for a small change. Each step needs a short title and observable expectedEvidence. Supply these through plan_task.steps. For logic changes, expectedEvidence must name concrete input/output cases covering every requested behavior and preserved edge cases. Do not substitute vague phrases such as "verify code" for behavior. Before editing, compare the proposed implementation against each case, including existing behavior that must remain. A typecheck proves type safety, not those cases; report behavioral coverage honestly.
For a bug: reproduce, identify the cause, fix, and run a regression. For development: establish the project, deliver vertical slices and verify the runnable flow. For improvement: measure a baseline, preserve contracts and compare results. For analysis: gather evidence and answer without mutations.
Choose checks from discovered project configurations; do not invent paths. Criteria describe observable user behavior, not a list of tool calls.
Ask only about unresolved decisions that materially alter scope or architecture. Inspect discoverable facts first; use reversible defaults for minor choices.
Plans are intentions, never evidence of completion. Revise the plan before proposing changes when new evidence changes the approach; preserve user constraints. After changes are proposed the contract is locked, so report a blocker if the required scope changes.
After context compaction, restore the goal, decisions, existing changes and failed checks from saved evidence. Continue the next unfinished action; do not ask the user to say continue.`;

/** A useful initial scaffold while the model gathers evidence for a specific plan. */
export function initialTaskSteps(prompt: string): NonNullable<TaskRecord['steps']> {
  const { kind } = taskPipelineForPrompt(prompt);
  const inspect = {
    title: 'Inspect the request and project',
    expectedEvidence:
      'Relevant entry points, existing behavior, constraints and unresolved decisions identified from files.',
  };
  if (kind === 'analysis')
    return [
      inspect,
      {
        title: 'Explain the findings',
        expectedEvidence:
          'Answer supported by file references, with unknowns and limitations stated.',
      },
    ];
  const change =
    kind === 'development'
      ? {
          title: 'Build the requested behavior',
          expectedEvidence:
            'Runnable source and meaningful tests saved in the project using its conventions.',
        }
      : kind === 'improvement'
        ? {
            title: 'Establish a baseline and improve it',
            expectedEvidence:
              'Measured or reproducible baseline, focused changes and preserved public contracts.',
          }
        : {
            title: 'Reproduce and change the affected flow',
            expectedEvidence:
              'Existing behavior understood, affected callers checked and regression coverage added.',
          };
  return [
    inspect,
    change,
    {
      title: 'Validate the changed behavior',
      expectedEvidence:
        'Relevant checks executed after the last edit and the affected runtime flow exercised when applicable.',
    },
    {
      title: 'Report delivery evidence',
      expectedEvidence:
        'Changed files, actual check outcomes and remaining blockers reported without unsupported completion claims.',
    },
  ];
}
