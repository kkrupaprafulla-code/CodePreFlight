/**
 * Report emitter stub.
 *
 * Sub-Task 3: prints a placeholder message.
 * Real implementation (CLI table / JSON / HTML) added in Sub-Task 8.
 *
 * The emitter is the only module allowed to write to stdout or the filesystem
 * for output purposes. All other modules are side-effect-free.
 */

import type { ReportData } from '../types.js';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function emit(_data: ReportData): void {
  console.log('No changes detected.');
}
