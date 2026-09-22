export type ProgressTask = { project_id: string | null; status: string };

/**
 * Progress is derived from task completion (done tasks / total tasks for the
 * project), not manually typed — keeps it always honest instead of a stale
 * number a PM forgot to update.
 */
export function computeProjectProgress(projectId: string, tasks: ProgressTask[]): number {
  const projectTasks = tasks.filter((t) => t.project_id === projectId);
  if (projectTasks.length === 0) return 0;
  const done = projectTasks.filter((t) => t.status === "Done").length;
  return Math.round((done / projectTasks.length) * 100);
}
