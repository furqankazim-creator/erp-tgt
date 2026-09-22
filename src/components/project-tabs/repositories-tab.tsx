import { ExternalLink, GitBranch, GitCommit, GitPullRequest } from "lucide-react";

import { useRows } from "@/lib/db";
import { dateTimeLabel } from "@/lib/format";
import { EmptyState } from "@/components/loading";
import { Button } from "@/components/ui/button";
import type { Project } from "@/routes/_authenticated/project";

type PmCommit = {
  id: string;
  project_id: string | null;
  commit_sha: string;
  commit_message: string | null;
  employee: string | null;
  created_at: string;
};

// Best-effort parse of a github/gitlab/bitbucket URL into the sub-pages we
// can safely deep-link to with window.open — never render or transmit a
// token/credential client-side.
function repoLinks(repoUrl: string) {
  try {
    const url = new URL(repoUrl);
    const base = `${url.origin}${url.pathname.replace(/\/$/, "")}`;
    return {
      repo: base,
      branches: `${base}/branches`,
      commits: `${base}/commits`,
      prs: `${base}/pulls`,
    };
  } catch {
    return null;
  }
}

export function RepositoriesTab({ project }: { projectId: string; project: Project }) {
  const { data: commitRows } = useRows<PmCommit>("pm_commits");
  const commits = commitRows ?? [];
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  if (!project.repo_url) {
    return (
      <EmptyState
        title="No repository linked"
        description="Add a repo URL from Edit project to enable this."
      />
    );
  }

  const projectCommits = commits
    .filter((c) => c.project_id === project.id)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const latest = projectCommits[0];
  const commitsThisWeek = projectCommits.filter(
    (c) => new Date(c.created_at).getTime() >= weekAgo,
  ).length;
  const links = repoLinks(project.repo_url);

  return (
    <div className="surface-card animate-rise max-w-lg space-y-3 p-5">
      <div>
        <h3 className="font-semibold">{project.name}</h3>
        <p className="truncate text-xs text-muted-foreground">{project.repo_url}</p>
      </div>
      <div className="rounded-md bg-muted/50 p-2.5 text-xs">
        {latest ? (
          <>
            <p className="truncate font-medium text-foreground">
              {latest.commit_message || "(no message)"}
            </p>
            <p className="text-muted-foreground">
              {latest.employee ?? "Unknown"} · {latest.commit_sha.slice(0, 8)} ·{" "}
              {dateTimeLabel(latest.created_at)}
            </p>
          </>
        ) : (
          <p className="text-muted-foreground">No commits tracked yet.</p>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">{commitsThisWeek}</span> commits this week
      </p>
      {links ? (
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" onClick={() => window.open(links.repo, "_blank")}>
            <ExternalLink className="size-3.5" /> Repo
          </Button>
          <Button size="sm" variant="outline" onClick={() => window.open(links.branches, "_blank")}>
            <GitBranch className="size-3.5" /> Branches
          </Button>
          <Button size="sm" variant="outline" onClick={() => window.open(links.commits, "_blank")}>
            <GitCommit className="size-3.5" /> Commits
          </Button>
          <Button size="sm" variant="outline" onClick={() => window.open(links.prs, "_blank")}>
            <GitPullRequest className="size-3.5" /> PRs
          </Button>
        </div>
      ) : null}
    </div>
  );
}
