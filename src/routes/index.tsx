import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, BarChart3, Sparkles, Users } from "lucide-react";

import { auth } from "@/lib/mock-auth";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Time Global Tech CRM — Business Management Platform" },
      {
        name: "description",
        content:
          "Time Global Tech CRM is the internal platform for sales pipeline, client accounts, projects, HR and operations in one connected workspace.",
      },
      { property: "og:title", content: "Time Global Tech CRM — Business Management Platform" },
      {
        property: "og:description",
        content:
          "Manage sales, operations, HR and client relationships from a single modern workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  useEffect(() => {
    void auth.getSession().then(({ data }) => {
      if (data.session) void navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2.5">
          <span className="gradient-primary text-primary-foreground grid size-9 place-items-center rounded-xl">
            <Sparkles className="size-5" />
          </span>
          <span className="font-bold">Time Global Tech CRM</span>
        </div>
        <Button asChild size="sm">
          <Link to="/auth">Sign in</Link>
        </Button>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-24">
        <section className="animate-rise py-16 text-center sm:py-24">
          <span className="border-primary/25 bg-primary/10 text-primary inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold">
            Internal platform · v2.6
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
            Run sales, delivery and people from one workspace
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground">
            Eighteen connected modules — CRM, pipeline, projects, tickets, agreements and meetings —
            with live company data.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/auth">
                Open workspace <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </section>

        <section className="grid gap-5 sm:grid-cols-3">
          {[
            {
              icon: BarChart3,
              title: "Revenue clarity",
              body: "Pipeline, forecast and leaderboard in real time.",
            },
            {
              icon: Users,
              title: "One source of truth",
              body: "Accounts, contacts and agreements linked end to end.",
            },
            {
              icon: Sparkles,
              title: "Built for speed",
              body: "Command palette, instant search, keyboard-first.",
            },
          ].map((f) => (
            <div key={f.title} className="surface-card surface-card-hover p-6">
              <span className="bg-primary/12 text-primary grid size-10 place-items-center rounded-xl">
                <f.icon className="size-5" />
              </span>
              <h2 className="mt-4 font-semibold">{f.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
