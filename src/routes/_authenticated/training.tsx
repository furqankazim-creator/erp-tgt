import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Award,
  BookOpen,
  Clock3,
  GraduationCap,
  Layers,
  Plus,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  XCircle,
} from "lucide-react";

import { useRows } from "@/lib/db";
import { initials, number } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { RecordDialog, type Field } from "@/components/record-dialog";
import { DeleteButton } from "@/components/delete-button";
import { KpiCard } from "@/components/kpi-card";
import { CardGridSkeleton } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export const Route = createFileRoute("/_authenticated/training")({
  head: () => ({
    meta: [
      { title: "Training — Time Global Tech CRM" },
      { name: "description", content: "Learning modules, progress and certifications." },
      { property: "og:title", content: "Training — Time Global Tech CRM" },
      { property: "og:description", content: "Learning modules, progress and certifications." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

type Course = {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  modules: number;
  status: string;
  enrolled: number;
  certified: number;
  progress: number;
  duration: string;
  level: "Beginner" | "Intermediate" | "Advanced";
  instructor: string;
  description: string;
  outcomes: string[];
};

const CATEGORIES = [
  "All",
  "Sales",
  "Engineering",
  "After Sales",
  "Compliance",
  "People",
  "All teams",
  "Operations",
  "Marketing",
];

const STATUSES = ["All", "On Track", "At Risk", "Delayed"];

const LEVEL_COLORS: Record<Course["level"], string> = {
  Beginner: "bg-success/12 text-success border-success/25",
  Intermediate: "bg-primary/12 text-primary border-primary/25",
  Advanced: "bg-warning/15 text-warning border-warning/30",
};

const PROGRESS_COLOR = (p: number) => {
  if (p >= 80) return "bg-success";
  if (p >= 50) return "bg-primary";
  if (p >= 25) return "bg-warning";
  return "bg-destructive";
};

const COURSE_FIELDS: Field[] = [
  {
    name: "title",
    label: "Course title",
    required: true,
    full: true,
    section: "Course Information",
  },
  { name: "subtitle", label: "Subtitle / tagline", full: true },
  {
    name: "category",
    label: "Category",
    type: "select",
    options: CATEGORIES.filter((c) => c !== "All"),
  },
  {
    name: "level",
    label: "Level",
    type: "select",
    options: ["Beginner", "Intermediate", "Advanced"],
  },
  {
    name: "status",
    label: "Status",
    type: "select",
    options: STATUSES.filter((s) => s !== "All"),
  },
  { name: "instructor", label: "Instructor name", section: "Logistics & Content" },
  { name: "modules", label: "Module count", type: "number" },
  { name: "duration", label: "Duration (e.g. 4h 30m)" },
  { name: "enrolled", label: "Enrolled count", type: "number", section: "Enrollment & Progress" },
  { name: "certified", label: "Certified count", type: "number" },
  { name: "progress", label: "Avg progress %", type: "number" },
  {
    name: "description",
    label: "Course description",
    type: "textarea",
    full: true,
    rows: 6,
    section: "Description",
  },
];

function Page() {
  const { data, isLoading } = useRows<Course>("trainings");
  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selected, setSelected] = useState<Course | null>(null);

  const COURSES = data ?? [];

  const courses = useMemo(() => {
    return COURSES.filter((c) => {
      const matchesQuery = `${c.title} ${c.category} ${c.instructor} ${c.subtitle}`
        .toLowerCase()
        .includes(query.toLowerCase());
      const matchesCat = catFilter === "All" || c.category === catFilter;
      const matchesStatus = statusFilter === "All" || c.status === statusFilter;
      return matchesQuery && matchesCat && matchesStatus;
    });
  }, [COURSES, query, catFilter, statusFilter]);

  if (isLoading) return <CardGridSkeleton />;

  const totalEnrolled = COURSES.reduce((s, c) => s + c.enrolled, 0);
  const totalCertified = COURSES.reduce((s, c) => s + c.certified, 0);
  const avgProgress = Math.round(COURSES.reduce((s, c) => s + c.progress, 0) / COURSES.length);
  const atRisk = COURSES.filter((c) => c.status === "At Risk" || c.status === "Delayed").length;
  const certRate = totalEnrolled ? Math.round((totalCertified / totalEnrolled) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Training"
        description="Learning paths, progress tracking and certifications for every team."
        action={
          <RecordDialog
            table="trainings"
            label="Course"
            fields={COURSE_FIELDS}
            dialogClassName="sm:max-w-4xl"
            defaults={{
              status: "On Track",
              level: "Beginner",
              category: "All teams",
              modules: "4",
              enrolled: "0",
              certified: "0",
              progress: "0",
            }}
            trigger={
              <Button>
                <Plus className="size-4" /> New course
              </Button>
            }
          />
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Active courses"
          value={number(COURSES.length)}
          delta={2}
          hint="launched this quarter"
          icon={BookOpen}
        />
        <KpiCard
          label="Total enrollments"
          value={number(totalEnrolled)}
          delta={14}
          hint={`${number(certRate)}% certified`}
          icon={Users}
        />
        <KpiCard
          label="Certifications"
          value={number(totalCertified)}
          delta={9}
          hint="earned this quarter"
          icon={Award}
        />
        <KpiCard
          label="Avg progress"
          value={`${avgProgress}%`}
          hint={`${number(atRisk)} courses at risk`}
          icon={TrendingUp}
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative sm:max-w-sm">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              className="pl-9"
              placeholder="Search courses, instructors…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                  statusFilter === s
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:border-primary/40"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.slice(0, 7).map((c) => (
            <button
              key={c}
              onClick={() => setCatFilter(c)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                catFilter === c
                  ? "border-primary bg-primary/12 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/30"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <Tabs defaultValue="library">
        <TabsList>
          <TabsTrigger value="library">Course Library</TabsTrigger>
          <TabsTrigger value="progress">Progress Tracker</TabsTrigger>
          <TabsTrigger value="certifications">Certifications</TabsTrigger>
        </TabsList>

        <TabsContent value="library" className="pt-4">
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {courses.map((c, idx) => (
              <button
                key={c.id}
                onClick={() => setSelected(c)}
                className="surface-card surface-card-hover animate-rise group relative overflow-hidden p-0 text-left"
                style={{ animationDelay: `${idx * 40}ms` }}
              >
                <div
                  className="relative h-28 w-full"
                  style={{
                    background: `linear-gradient(135deg, hsl(${(idx * 47) % 360} 60% 55% / 0.9), hsl(${(idx * 47 + 60) % 360} 55% 45% / 0.9))`,
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-card/80 to-transparent" />
                  <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="bg-background/85 backdrop-blur-sm grid size-9 place-items-center rounded-xl">
                        <GraduationCap className="text-primary size-4.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-background/90 uppercase tracking-wide">
                          {c.category}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold bg-background/85 backdrop-blur-sm ${LEVEL_COLORS[c.level]}`}
                    >
                      {c.level}
                    </span>
                  </div>
                </div>

                <div className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate font-bold leading-snug">{c.title}</h3>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Layers className="size-3" /> {c.modules} modules
                        </span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1">
                          <Clock3 className="size-3" /> {c.duration}
                        </span>
                      </p>
                    </div>
                    <StatusBadge value={c.status} />
                  </div>

                  <div className="mt-4">
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Course progress</span>
                      <span className="font-bold">{c.progress}%</span>
                    </div>
                    <Progress
                      value={c.progress}
                      className="h-2 bg-muted"
                      indicatorClassName={PROGRESS_COLOR(c.progress)}
                    />
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 border-t pt-4 text-xs">
                    <div className="rounded-lg bg-primary/5 p-2.5">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Users className="size-3" /> Enrolled
                      </div>
                      <p className="mt-0.5 font-bold text-sm">{number(c.enrolled)}</p>
                    </div>
                    <div className="rounded-lg bg-success/5 p-2.5">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Award className="size-3" /> Certified
                      </div>
                      <p className="mt-0.5 font-bold text-sm text-success">{number(c.certified)}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Avatar className="size-7">
                        <AvatarFallback className="bg-primary/15 text-primary text-[10px] font-bold">
                          {initials(c.instructor)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate text-xs text-muted-foreground">{c.instructor}</span>
                    </div>
                    <Badge variant="outline" className="text-[10px] px-2 py-0.5">
                      <Sparkles className="size-3 mr-1" />
                      {c.enrolled ? Math.round((c.certified / c.enrolled) * 100) : 0}% pass rate
                    </Badge>
                  </div>
                </div>
              </button>
            ))}
            {courses.length === 0 ? (
              <div className="surface-card col-span-full p-12 text-center">
                <p className="text-sm font-medium">No courses match your filters</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Try a different search or category.
                </p>
              </div>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="progress" className="pt-4">
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="surface-card p-5">
                <div className="flex items-center gap-3">
                  <div className="bg-success/15 text-success grid size-10 place-items-center rounded-xl">
                    <Target className="size-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase">
                      On track
                    </p>
                    <p className="text-2xl font-bold">
                      {number(COURSES.filter((c) => c.status === "On Track").length)}
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Progressing against schedule</p>
              </div>
              <div className="surface-card p-5">
                <div className="flex items-center gap-3">
                  <div className="bg-warning/15 text-warning grid size-10 place-items-center rounded-xl">
                    <Clock3 className="size-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase">At risk</p>
                    <p className="text-2xl font-bold">
                      {number(COURSES.filter((c) => c.status === "At Risk").length)}
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Needs attention this cycle</p>
              </div>
              <div className="surface-card p-5">
                <div className="flex items-center gap-3">
                  <div className="bg-destructive/15 text-destructive grid size-10 place-items-center rounded-xl">
                    <XCircle className="size-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Delayed</p>
                    <p className="text-2xl font-bold">
                      {number(COURSES.filter((c) => c.status === "Delayed").length)}
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Behind schedule — escalate</p>
              </div>
            </div>

            <div className="surface-card overflow-hidden">
              <div className="border-b p-5">
                <h3 className="font-semibold">Progress overview</h3>
                <p className="text-sm text-muted-foreground">
                  All courses sorted by progress — click to view details
                </p>
              </div>
              <div className="divide-border divide-y">
                {[...COURSES]
                  .sort((a, b) => b.progress - a.progress)
                  .filter((c) => catFilter === "All" || c.category === catFilter)
                  .map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setSelected(c)}
                      className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/40"
                    >
                      <div
                        className="grid size-11 shrink-0 place-items-center rounded-xl text-white"
                        style={{
                          background: `linear-gradient(135deg, hsl(${(COURSES.indexOf(c) * 47) % 360} 60% 55%), hsl(${(COURSES.indexOf(c) * 47 + 60) % 360} 55% 45%))`,
                        }}
                      >
                        <BookOpen className="size-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="font-semibold">{c.title}</p>
                          <Badge variant="outline" className="text-[10px]">
                            {c.category}
                          </Badge>
                          <StatusBadge value={c.status} />
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {c.modules} modules · {c.duration} · by {c.instructor}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 sm:min-w-[260px]">
                        <div className="flex w-full items-center gap-3">
                          <Progress
                            value={c.progress}
                            className="h-2.5 flex-1 bg-muted"
                            indicatorClassName={PROGRESS_COLOR(c.progress)}
                          />
                          <span className="min-w-[44px] text-right text-sm font-bold">
                            {c.progress}%
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Users className="size-3" /> {c.enrolled} enrolled
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Award className="size-3 text-success" /> {c.certified} certified
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="certifications" className="pt-4">
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {COURSES.filter((c) => c.certified > 0).map((c) => (
              <div key={c.id} className="surface-card animate-rise overflow-hidden">
                <div className="bg-gradient-to-br from-primary/15 via-transparent to-success/10 p-5">
                  <div className="flex items-start justify-between">
                    <div className="bg-card grid size-12 place-items-center rounded-2xl shadow-sm">
                      <Award className="text-primary size-6" />
                    </div>
                    <StatusBadge value={c.status} />
                  </div>
                  <div className="mt-5">
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                      Certification
                    </p>
                    <h3 className="mt-1 font-bold leading-tight">{c.title}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {c.category} · {c.modules} modules
                    </p>
                  </div>
                </div>
                <div className="space-y-4 p-5">
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="rounded-xl bg-success/10 p-3">
                      <p className="text-2xl font-bold text-success">{number(c.certified)}</p>
                      <p className="text-[11px] text-muted-foreground">Certified</p>
                    </div>
                    <div className="rounded-xl bg-primary/10 p-3">
                      <p className="text-2xl font-bold text-primary">
                        {c.enrolled ? Math.round((c.certified / c.enrolled) * 100) : 0}%
                      </p>
                      <p className="text-[11px] text-muted-foreground">Pass rate</p>
                    </div>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Total enrolled</span>
                      <span className="font-semibold">{number(c.enrolled)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">In progress</span>
                      <span className="font-semibold">{number(c.enrolled - c.certified)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Instructor</span>
                      <span className="font-semibold">{c.instructor}</span>
                    </div>
                  </div>
                  <div>
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Completion</span>
                      <span className="font-bold">{c.progress}%</span>
                    </div>
                    <Progress
                      value={c.progress}
                      className="h-2"
                      indicatorClassName={PROGRESS_COLOR(c.progress)}
                    />
                  </div>
                  <Button variant="outline" className="w-full" onClick={() => setSelected(c)}>
                    View course details
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <Sheet open={Boolean(selected)} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selected ? (
            <div className="space-y-6 px-1 pb-6">
              <div
                className="-mx-5 -mt-5 mb-2"
                style={{
                  background: `linear-gradient(135deg, hsl(${(COURSES.indexOf(selected) * 47) % 360} 60% 55% / 0.9), hsl(${(COURSES.indexOf(selected) * 47 + 60) % 360} 55% 45% / 0.9))`,
                }}
              >
                <SheetHeader className="p-6 text-white">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Badge className="bg-white/90 text-black border-0">{selected.category}</Badge>
                      <SheetTitle className="mt-3 text-2xl text-white">{selected.title}</SheetTitle>
                      <SheetDescription className="mt-1 text-white/80">
                        {selected.modules} modules · {selected.duration} · {selected.level}
                      </SheetDescription>
                    </div>
                    <div className="bg-white/90 backdrop-blur-sm grid size-12 shrink-0 place-items-center rounded-2xl">
                      <GraduationCap className="text-primary size-6" />
                    </div>
                  </div>
                </SheetHeader>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge value={selected.status} />
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${LEVEL_COLORS[selected.level]}`}
                >
                  {selected.level}
                </span>
                <Badge variant="outline">
                  <Award className="size-3 mr-1" /> {selected.certified} certified
                </Badge>
              </div>

              <div className="space-y-3 rounded-2xl border p-4">
                <h4 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
                  About this course
                </h4>
                <p className="text-sm leading-relaxed">{selected.description}</p>
                <div className="grid grid-cols-3 gap-3 pt-1 text-center text-xs">
                  <div className="rounded-lg bg-muted/60 p-2.5">
                    <p className="text-muted-foreground">Modules</p>
                    <p className="mt-0.5 font-bold text-sm">{selected.modules}</p>
                  </div>
                  <div className="rounded-lg bg-muted/60 p-2.5">
                    <p className="text-muted-foreground">Duration</p>
                    <p className="mt-0.5 font-bold text-sm">{selected.duration}</p>
                  </div>
                  <div className="rounded-lg bg-muted/60 p-2.5">
                    <p className="text-muted-foreground">Enrolled</p>
                    <p className="mt-0.5 font-bold text-sm">{selected.enrolled}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4 rounded-2xl border p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
                    Overall progress
                  </h4>
                  <span className="text-lg font-bold">{selected.progress}%</span>
                </div>
                <Progress
                  value={selected.progress}
                  className="h-3"
                  indicatorClassName={PROGRESS_COLOR(selected.progress)}
                />
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl bg-success/10 p-3">
                    <div className="flex items-center gap-1.5 text-success">
                      <Award className="size-4" /> Certified
                    </div>
                    <p className="mt-1 text-xl font-bold text-success">
                      {number(selected.certified)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {selected.enrolled
                        ? Math.round((selected.certified / selected.enrolled) * 100)
                        : 0}
                      % of enrolled
                    </p>
                  </div>
                  <div className="rounded-xl bg-primary/10 p-3">
                    <div className="flex items-center gap-1.5 text-primary">
                      <Users className="size-4" /> In progress
                    </div>
                    <p className="mt-1 text-xl font-bold text-primary">
                      {number(selected.enrolled - selected.certified)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">active learners right now</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border p-4">
                <h4 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
                  Learning outcomes
                </h4>
                {(selected.outcomes ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No outcomes listed yet.</p>
                ) : null}
                <ul className="space-y-2">
                  {(selected.outcomes ?? []).map((outcome, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm">
                      <span className="bg-success/15 text-success mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold">
                        {i + 1}
                      </span>
                      <span>{outcome}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-2xl border p-4">
                <div className="flex items-center gap-3">
                  <Avatar className="size-11">
                    <AvatarFallback className="gradient-primary text-primary-foreground text-sm font-bold">
                      {initials(selected.instructor)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">
                      Instructor
                    </p>
                    <p className="font-semibold">{selected.instructor}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <RecordDialog
                  table="trainings"
                  label="Course"
                  fields={COURSE_FIELDS}
                  dialogClassName="sm:max-w-4xl"
                  record={selected}
                  trigger={
                    <Button variant="outline" className="w-full">
                      Edit
                    </Button>
                  }
                />
                <Button className="w-full">
                  <Sparkles className="size-4" /> Open
                </Button>
                <DeleteButton table="trainings" id={selected.id} label="Course" />
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
