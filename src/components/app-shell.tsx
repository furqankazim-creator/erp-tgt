import { useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, LogOut, Menu, Search, Sparkles, X } from "lucide-react";
import type { ReactNode } from "react";

import { auth, useCurrentUser } from "@/lib/mock-auth";
import { NAV_GROUPS, navForRole, type NavItem } from "@/lib/nav";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "@/components/notification-bell";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

function SidebarNav({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const isActive = (to: string) => pathname === to || pathname.startsWith(`${to}/`);

  return (
    <nav className="sidebar-scroll flex-1 space-y-5 overflow-y-auto px-3 pb-6">
      {NAV_GROUPS.filter((group) => items.some((item) => item.group === group)).map((group) => (
        <div key={group}>
          <p className="text-sidebar-foreground/45 px-3 pb-1.5 text-[11px] font-bold tracking-widest uppercase">
            {group}
          </p>
          <div className="space-y-1">
            {items
              .filter((item) => item.group === group)
              .map((item) => {
                const active = isActive(item.to);
                const childActive = item.children?.some((c) => isActive(c.to)) ?? false;
                const isOpen = expanded[item.to] ?? (active || childActive);
                return (
                  <div key={item.to}>
                    <div
                      className={cn(
                        "group flex items-center gap-1 rounded-lg pr-1.5 text-sm font-medium transition-all duration-200",
                        active
                          ? "bg-sidebar-primary/15 text-sidebar-primary-foreground shadow-inner"
                          : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      )}
                    >
                      <Link
                        to={item.to}
                        onClick={onNavigate}
                        className="flex flex-1 items-center gap-3 px-3 py-2"
                      >
                        <item.icon
                          className={cn(
                            "size-4 shrink-0 transition-transform duration-200 group-hover:scale-110",
                            active && "text-sidebar-primary",
                          )}
                        />
                        <span className="truncate">{item.label}</span>
                        {active ? (
                          <span className="bg-sidebar-primary ml-auto h-4 w-1 rounded-full" />
                        ) : null}
                      </Link>
                      {item.children?.length ? (
                        <button
                          type="button"
                          onClick={() => setExpanded((e) => ({ ...e, [item.to]: !isOpen }))}
                          aria-label={isOpen ? `Collapse ${item.label}` : `Expand ${item.label}`}
                          className="rounded-md p-1.5 text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        >
                          <ChevronDown
                            className={cn(
                              "size-3.5 transition-transform duration-200",
                              isOpen && "rotate-180",
                            )}
                          />
                        </button>
                      ) : null}
                    </div>
                    {item.children?.length && isOpen ? (
                      <div className="mt-1 ml-4 space-y-1 border-l border-sidebar-border pl-3">
                        {item.children.map((child) => {
                          const childIsActive = isActive(child.to);
                          return (
                            <Link
                              key={child.to}
                              to={child.to}
                              onClick={onNavigate}
                              className={cn(
                                "group flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200",
                                childIsActive
                                  ? "bg-sidebar-primary/15 text-sidebar-primary-foreground shadow-inner"
                                  : "text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                              )}
                            >
                              <child.icon
                                className={cn(
                                  "size-3.5 shrink-0 transition-transform duration-200 group-hover:scale-110",
                                  childIsActive && "text-sidebar-primary",
                                )}
                              />
                              <span className="truncate">{child.label}</span>
                              {childIsActive ? (
                                <span className="bg-sidebar-primary ml-auto h-3.5 w-1 rounded-full" />
                              ) : null}
                            </Link>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-5 py-5">
      <span className="gradient-primary text-primary-foreground grid size-9 place-items-center rounded-xl shadow-lg">
        <Sparkles className="size-5" />
      </span>
      <div className="leading-tight">
        <p className="text-sidebar-accent-foreground text-sm font-bold">Time Global Tech</p>
        <p className="text-sidebar-foreground/55 text-xs font-medium tracking-wide">CRM Platform</p>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: me } = useCurrentUser();
  const email = me?.email ?? "";
  const role = me?.access_role ?? "developer";
  const navItems = navForRole(role);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await auth.signOut();
    void navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="gradient-sidebar border-sidebar-border sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r lg:flex">
        <Brand />
        <SidebarNav items={navItems} />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="gradient-sidebar animate-rise absolute inset-y-0 left-0 flex w-72 flex-col shadow-2xl">
            <div className="flex items-center justify-between pr-3">
              <Brand />
              <Button
                variant="ghost"
                size="icon"
                className="text-sidebar-foreground"
                onClick={() => setMobileOpen(false)}
              >
                <X className="size-4" />
              </Button>
            </div>
            <SidebarNav items={navItems} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-background/85 border-border sticky top-0 z-40 flex h-16 items-center gap-3 border-b px-4 backdrop-blur-lg sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="size-5" />
          </Button>

          <button
            onClick={() => setPaletteOpen(true)}
            className="border-border bg-muted/50 text-muted-foreground hover:border-primary/40 hover:bg-muted flex h-9 flex-1 max-w-sm items-center gap-2 rounded-lg border px-3 text-sm transition-colors"
          >
            <Search className="size-4" />
            <span className="truncate">Search modules, clients, deals…</span>
            <kbd className="border-border bg-background ml-auto hidden rounded border px-1.5 py-0.5 text-[10px] font-semibold sm:block">
              ⌘K
            </kbd>
          </button>

          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <NotificationBell />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="hover:bg-muted ml-1 flex items-center gap-2 rounded-full py-1 pr-2 pl-1 transition-colors">
                  <Avatar className="size-8">
                    <AvatarFallback className="bg-primary/15 text-primary text-xs font-bold">
                      {initials(email || "Time Global Tech")}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden max-w-32 truncate text-sm font-medium sm:block">
                    {email || "Team member"}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="truncate">
                  {email || "Signed in"}
                  <span className="text-muted-foreground mt-0.5 block text-[11px] font-normal capitalize">
                    {role.replace("_", " ")}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {role === "super_admin" || role === "admin" ? (
                  <DropdownMenuItem onClick={() => void navigate({ to: "/hr" })}>
                    My team
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onClick={() => void navigate({ to: "/documents" })}>
                  My documents
                </DropdownMenuItem>
                {role === "super_admin" || role === "admin" ? (
                  <DropdownMenuItem onClick={() => void navigate({ to: "/settings" })}>
                    Settings
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void signOut()}>
                  <LogOut className="size-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main key={pathname} className="animate-rise flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>

      <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen}>
        <CommandInput placeholder="Jump to a module…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Modules">
            {navItems.map((item) => (
              <CommandItem
                key={item.to}
                value={item.label}
                onSelect={() => {
                  setPaletteOpen(false);
                  void navigate({ to: item.to });
                }}
              >
                <item.icon className="size-4" />
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
}
