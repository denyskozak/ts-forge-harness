import type { ValidationCheck } from './task';
export function checkKey(check: ValidationCheck) {
  return JSON.stringify([check.recipe, check.project, [...check.files].sort()]);
}
