import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  GitCommit,
  MousePointerClick,
  Radio,
  ShieldCheck,
  Timer,
} from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/pm-connect")({
  head: () => ({
    meta: [
      { title: "PM Connect — Download | Time Global Tech CRM" },
      {
        name: "description",
        content: "Download the PM Connect VS Code extension for automatic project tracking.",
      },
      { property: "og:title", content: "PM Connect — Download | Time Global Tech CRM" },
      {
        property: "og:description",
        content: "Zero-effort commit and active-time tracking, straight into the CRM.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PmConnectPage,
});

const VSIX_URL = "/pm-connect/pm-connect-0.1.0.vsix";

function PmConnectPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-10 px-4 py-12 sm:px-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/dashboard">
            <ArrowLeft className="size-4" /> Back to CRM
          </Link>
        </Button>
      </div>

      <div className="text-center">
        <span className="gradient-primary text-primary-foreground mx-auto mb-4 grid size-14 place-items-center rounded-2xl">
          <GitCommit className="size-7" />
        </span>
        <h1 className="text-3xl font-bold tracking-tight">PM Connect</h1>
        <p className="mt-2 text-muted-foreground">
          Automatic project tracking for VS Code — zero manual effort, straight into Time Global
          Tech CRM.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" asChild>
            <a href={VSIX_URL} download>
              <Download className="size-4" /> Download extension (.vsix)
            </a>
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">v0.1.0 · works with VS Code 1.85+</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="surface-card p-5">
          <GitCommit className="text-primary size-5" />
          <h3 className="mt-3 font-semibold">Commit tracking</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Every git commit is automatically logged with SHA, message, and changed files.
          </p>
        </div>
        <div className="surface-card p-5">
          <MousePointerClick className="text-primary size-5" />
          <h3 className="mt-3 font-semibold">Zero interaction</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Just open your project folder — the extension connects silently in the background.
          </p>
        </div>
        <div className="surface-card p-5">
          <Timer className="text-primary size-5" />
          <h3 className="mt-3 font-semibold">Active time tracking</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Coding time is passively measured, only while VS Code is focused and you're active.
          </p>
        </div>
        <div className="surface-card p-5">
          <Radio className="text-primary size-5" />
          <h3 className="mt-3 font-semibold">CRM integration</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Tasks, reports and work logs update automatically — visible on each project's "VS Dev
            Activity" tab.
          </p>
        </div>
      </div>

      <div className="surface-card p-6">
        <h2 className="font-semibold">How it works</h2>
        <ol className="mt-4 space-y-3 text-sm">
          <li className="flex gap-3">
            <span className="bg-primary/12 text-primary grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold">
              1
            </span>
            Open your assigned project folder in VS Code.
          </li>
          <li className="flex gap-3">
            <span className="bg-primary/12 text-primary grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold">
              2
            </span>
            The extension detects your git email + folder name and sends a silent handshake to the
            CRM.
          </li>
          <li className="flex gap-3">
            <span className="bg-primary/12 text-primary grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold">
              3
            </span>
            The CRM matches you to your employee record and project, and returns a secure token.
          </li>
          <li className="flex gap-3">
            <span className="bg-primary/12 text-primary grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold">
              4
            </span>
            Tracking starts automatically — commits instantly, active time every 60s.
          </li>
        </ol>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="surface-card p-6">
          <h2 className="font-semibold">Developer setup</h2>
          <ol className="mt-4 space-y-2 text-sm text-muted-foreground">
            <li>1. Download the .vsix above.</li>
            <li>
              2. In VS Code: <code className="text-foreground">Ctrl+Shift+X</code> → "…" menu →
              "Install from VSIX…"
            </li>
            <li>
              3. <code className="text-foreground">Ctrl+Shift+P</code> → "Reload Window"
            </li>
            <li>4. Open the project folder assigned to you in the CRM. Done.</li>
          </ol>
          <p className="mt-4 flex items-center gap-2 text-xs text-success">
            <CheckCircle2 className="size-3.5" /> You'll know it worked when a PM Connect icon
            appears in the Activity Bar and a green status shows in the bottom bar.
          </p>
        </div>

        <div className="surface-card p-6">
          <h2 className="font-semibold">Admin setup (in the CRM)</h2>
          <ol className="mt-4 space-y-2 text-sm text-muted-foreground">
            <li>
              1. HR → Employees — set the employee's{" "}
              <span className="text-foreground">Git email</span> to match their{" "}
              <code className="text-foreground">git config user.email</code>.
            </li>
            <li>
              2. Delivery → Projects — the project name should contain the developer's workspace
              folder name (or set the repo URL), and list them on the team.
            </li>
            <li>3. Optional: assign tasks — they'll appear in the developer's VS Code sidebar.</li>
          </ol>
          <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" /> Only commit metadata and active time are tracked —
            never file contents, keystrokes, or screenshots.
          </p>
        </div>
      </div>
    </div>
  );
}
