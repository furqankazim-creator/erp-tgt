import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Search,
  Sparkles,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";

import { auth } from "@/lib/mock-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Time Global Tech CRM" },
      {
        name: "description",
        content:
          "Sign in to Time Global Tech CRM to manage sales pipeline, clients, projects and teams.",
      },
      { property: "og:title", content: "Sign in — Time Global Tech CRM" },
      {
        property: "og:description",
        content: "Secure access to the Time Global Tech business management workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

const FEATURES = [
  { icon: BarChart3, text: "Live pipeline, forecasts and leaderboards" },
  { icon: Search, text: "Command palette and instant search" },
  { icon: KeyRound, text: "Accounts, contacts and agreements — linked end to end" },
];

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    void auth.getSession().then(({ data }) => {
      if (data.session) void navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    void navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Marketing panel */}
      <div className="gradient-sidebar text-sidebar-foreground relative hidden flex-col justify-between overflow-hidden p-12 lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />
        <div
          aria-hidden
          className="bg-primary/30 pointer-events-none absolute -top-24 -right-24 size-96 rounded-full blur-3xl"
        />
        <div
          aria-hidden
          className="bg-primary-glow/20 pointer-events-none absolute bottom-0 left-0 size-72 rounded-full blur-3xl"
        />

        <Link to="/" className="animate-rise relative z-10 flex items-center gap-3">
          <span className="gradient-primary text-primary-foreground grid size-10 place-items-center rounded-xl shadow-lg">
            <Sparkles className="size-5" />
          </span>
          <span className="text-sidebar-accent-foreground text-lg font-bold">
            Time Global Tech CRM
          </span>
        </Link>

        <div className="relative z-10 space-y-6">
          <div className="animate-rise space-y-4">
            <span className="border-sidebar-border bg-sidebar-accent/50 text-sidebar-foreground/80 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium">
              <Wand2 className="size-3.5" />
              Internal platform · v2.6
            </span>
            <h2 className="text-sidebar-accent-foreground max-w-md text-4xl font-bold tracking-tight text-balance">
              One workspace for sales, delivery, operations and people.
            </h2>
            <p className="text-sidebar-foreground/70 max-w-md">
              Pipeline, projects, tickets, agreements and meetings — connected and live for the
              whole company.
            </p>
          </div>

          <ul className="space-y-3">
            {FEATURES.map((f, i) => (
              <li
                key={f.text}
                className="animate-rise text-sidebar-foreground/85 flex items-center gap-3 text-sm"
                style={{ animationDelay: `${(i + 1) * 90}ms` }}
              >
                <span className="bg-sidebar-accent text-primary-glow grid size-7 shrink-0 place-items-center rounded-lg">
                  <f.icon className="size-3.5" />
                </span>
                {f.text}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-sidebar-foreground/50 relative z-10 text-xs">
          © {new Date().getFullYear()} Time Global Tech. Internal platform.
        </p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="animate-rise w-full max-w-sm">
          <Link to="/" className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="gradient-primary text-primary-foreground grid size-9 place-items-center rounded-xl">
              <Sparkles className="size-5" />
            </span>
            <span className="font-bold">Time Global Tech CRM</span>
          </Link>

          <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to your Time Global Tech workspace. New accounts are created by an Admin or
            Super Admin from Settings — there's no public sign-up.
          </p>

          <form onSubmit={signIn} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="email" className="mb-1.5 block text-xs font-semibold">
                Work email
              </Label>
              <div className="relative">
                <Mail className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@globaltech.io"
                  className="pl-9"
                />
              </div>
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <Label htmlFor="password" className="text-xs font-semibold">
                  Password
                </Label>
              </div>
              <div className="relative">
                <Lock className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="px-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2 transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              {busy ? "Signing in…" : "Sign in"}
              {!busy && <ArrowRight className="size-4" />}
            </Button>
          </form>

        </div>
      </div>
    </div>
  );
}
