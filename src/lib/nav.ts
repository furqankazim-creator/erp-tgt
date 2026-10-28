import {
  LayoutDashboard,
  Target,
  CalendarClock,
  UserRound,
  Users,
  Building2,
  Package,
  BookOpen,
  Award,
  Images,
  Megaphone,
  MessageSquare,
  Contact,
  CalendarDays,
  MonitorPlay,
  TrendingUp,
  Calculator,
  FileSignature,
  Landmark,
  Receipt,
  PiggyBank,
  FolderKanban,
  ListChecks,
  LifeBuoy,
  Settings2,
  FileText,
  FileSpreadsheet,
  GraduationCap,
  ClipboardList,
  Timer,
  ShieldCheck,
  ScrollText,
  Scale,
  HandCoins,
  Gauge,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import type { AccessRole } from "@/lib/mock-auth";

const STAFF: AccessRole[] = ["super_admin", "admin"];
// A Salesman works the CRM → Sales pipeline (Inquiries through Agreements)
// scoped to their own inquiries/deals, the same way a Developer is scoped to
// their own project(s) — see SALES below and the page-level filters in
// inquiries.index.tsx / opportunities.tsx.
const SALES: AccessRole[] = ["super_admin", "admin", "salesman"];
const EVERYONE: AccessRole[] = ["super_admin", "admin", "developer", "salesman"];

export type NavChild = {
  label: string;
  to: string;
  icon: LucideIcon;
  roles?: AccessRole[];
};

export type NavItem = {
  label: string;
  to: string;
  icon: LucideIcon;
  group: string;
  children?: NavChild[];
  /** Which access roles see this item. Defaults to Admin + Super Admin only —
   * a Developer only gets the handful of modules explicitly opted in below
   * (their own projects, time logging, documents). */
  roles?: AccessRole[];
};

export const NAV_ITEMS: NavItem[] = [
  // Organization
  {
    label: "Dashboard",
    to: "/dashboard",
    icon: LayoutDashboard,
    group: "Organization",
    roles: EVERYONE,
  },
  { label: "Strategy", to: "/strategy", icon: Target, group: "Organization", roles: STAFF },
  { label: "Planning", to: "/planning", icon: CalendarClock, group: "Organization", roles: STAFF },
  {
    label: "Settings",
    to: "/settings",
    icon: ShieldCheck,
    group: "Organization",
    roles: STAFF,
  },
  {
    label: "Trash",
    to: "/trash",
    icon: Trash2,
    group: "Organization",
    roles: EVERYONE,
  },

  // People
  { label: "HR", to: "/hr", icon: UserRound, group: "People", roles: STAFF },
  { label: "Teams", to: "/teams", icon: Users, group: "People", roles: STAFF },
  { label: "Training", to: "/training", icon: GraduationCap, group: "People", roles: STAFF },

  // Marketing
  {
    label: "Company Profile",
    to: "/company-profile",
    icon: Building2,
    group: "Marketing",
    roles: STAFF,
  },
  {
    label: "Products & Services",
    to: "/products-services",
    icon: Package,
    group: "Marketing",
    roles: STAFF,
  },
  {
    label: "Sales Literature",
    to: "/sales-literature",
    icon: BookOpen,
    group: "Marketing",
    roles: STAFF,
  },
  { label: "Certifications", to: "/certifications", icon: Award, group: "Marketing", roles: STAFF },
  { label: "Portfolio", to: "/portfolio", icon: Images, group: "Marketing", roles: STAFF },
  { label: "Campaigns", to: "/marketing", icon: Megaphone, group: "Marketing", roles: STAFF },

  // CRM
  { label: "Enquiries", to: "/inquiries", icon: MessageSquare, group: "CRM", roles: SALES },
  { label: "Leads & Contacts", to: "/crm", icon: Contact, group: "CRM", roles: SALES },
  { label: "Meetings", to: "/meeting", icon: CalendarDays, group: "CRM", roles: SALES },
  { label: "Demos", to: "/demos", icon: MonitorPlay, group: "CRM", roles: SALES },

  // Sales
  { label: "Deals", to: "/opportunities", icon: TrendingUp, group: "Sales", roles: SALES },
  { label: "Estimations", to: "/estimations", icon: Calculator, group: "Sales", roles: SALES },
  { label: "Proposals", to: "/proposals", icon: ScrollText, group: "Sales", roles: SALES },
  { label: "Agreements", to: "/agreements", icon: FileSignature, group: "Sales", roles: SALES },

  // Finance
  {
    label: "Finance Overview",
    to: "/accounts-dashboard",
    icon: Gauge,
    group: "Finance",
    roles: STAFF,
  },
  { label: "Client Accounts", to: "/accounts", icon: Landmark, group: "Finance", roles: SALES },
  { label: "Costing", to: "/costing", icon: Receipt, group: "Finance", roles: STAFF },
  { label: "Revenue", to: "/revenue", icon: PiggyBank, group: "Finance", roles: STAFF },
  {
    label: "Invoices",
    to: "/invoices",
    icon: FileSpreadsheet,
    group: "Finance",
    roles: STAFF,
  },
  { label: "Payables", to: "/payables", icon: HandCoins, group: "Finance", roles: STAFF },
  { label: "Bookkeeping", to: "/bookkeeping", icon: Scale, group: "Finance", roles: STAFF },

  // Delivery — Admin/Super Admin see the full project list; a Developer sees
  // this same "Projects" entry but project.index.tsx scopes the list down to
  // just the project(s) they manage or are on the team for.
  {
    label: "Projects",
    to: "/project",
    icon: FolderKanban,
    group: "Delivery",
    roles: EVERYONE,
    children: [
      { label: "Reports", to: "/reports", icon: ClipboardList, roles: STAFF },
      { label: "Log Work", to: "/log-work", icon: Timer, roles: EVERYONE },
      // Developer delivery modules (Scope, Sprint Planning, Sprints, Q&A/Bugs,
      // Audit Report, Client Feedback, Repositories, Progress Report,
      // Feedback Statement, Send Invoice) now live as tabs inside a single
      // project's detail page (project.$projectId.tsx) rather than as
      // separate cross-project sidebar links — a Developer/Admin/Super Admin
      // opens a project and finds them all there, scoped to that project.
    ],
  },
  { label: "Execution", to: "/execution", icon: ListChecks, group: "Delivery", roles: STAFF },
  { label: "Operations", to: "/operations", icon: Settings2, group: "Delivery", roles: STAFF },
  { label: "After Sales", to: "/after-sales", icon: LifeBuoy, group: "Delivery", roles: STAFF },

  // Documents
  { label: "Documents", to: "/documents", icon: FileText, group: "Documents", roles: EVERYONE },
];

/** Nav items + children, filtered to what this role is allowed to see. */
export function navForRole(role: AccessRole): NavItem[] {
  return NAV_ITEMS.filter((item) => (item.roles ?? STAFF).includes(role)).map((item) => {
    const children = item.children?.filter((c) => (c.roles ?? STAFF).includes(role));
    return children ? { ...item, children } : item;
  });
}

export const NAV_GROUPS = [
  "Organization",
  "People",
  "Marketing",
  "CRM",
  "Sales",
  "Finance",
  "Delivery",
  "Documents",
] as const;
