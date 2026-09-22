import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  BellRing,
  Briefcase,
  CalendarDays,
  ClipboardList,
  Clock,
  FileSignature,
  FileText,
  Landmark,
  MessageSquare,
  UserPlus,
} from "lucide-react";

import { updateRow, useRows } from "@/lib/db";
import { useCurrentUser } from "@/lib/mock-auth";
import { timeAgo } from "@/lib/format";
import { armNotificationSound, playNotificationChime } from "@/lib/sound";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type AppNotification = {
  id: string;
  type: string;
  message: string;
  link: string;
  owner: string | null;
  actor: string | null;
  read_by: string[];
  created_at: string;
};

type Employee = { id: string; name: string; email: string | null };

const TYPE_ICON: Record<string, typeof Bell> = {
  inquiries_created: MessageSquare,
  inquiries_assigned: MessageSquare,
  contacts_created: UserPlus,
  contacts_assigned: UserPlus,
  deals_created: Briefcase,
  deals_assigned: Briefcase,
  deal_won: Briefcase,
  accounts_created: Landmark,
  accounts_assigned: Landmark,
  meetings_created: CalendarDays,
  quotes_created: FileText,
  agreements_created: FileSignature,
  agreements_assigned: FileSignature,
  projects_created: ClipboardList,
  followup_due: Clock,
  inquiry_pending: Clock,
};

export function NotificationBell() {
  const { data: me } = useCurrentUser();
  const { data: employeeRows } = useRows<Employee>("employees");
  const { data, isLoading } = useRows<AppNotification>("notifications", {
    column: "created_at",
    ascending: false,
    refetchInterval: 4000,
  });
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const seenIds = useRef<Set<string> | null>(null);

  const myName = (employeeRows ?? []).find(
    (e) => e.email && me?.email && e.email.toLowerCase() === me.email.toLowerCase(),
  )?.name;
  const myEmail = me?.email ?? "";

  const all = data ?? [];
  // Admin/Super Admin see every notification — they oversee everything.
  // A Salesman only sees the ones about their own work.
  const visible =
    me?.access_role === "salesman" ? (myName ? all.filter((n) => n.owner === myName) : []) : all;
  const unread = visible.filter((n) => !n.read_by.includes(myEmail));

  // Arm the audio-unlock listener the moment this bell exists, so sound is
  // ready well before the first real notification needs to play (browsers
  // block audio started on a timer until the page's had a real click/key).
  useEffect(() => {
    armNotificationSound();
  }, []);

  // Play a chime only for notifications that showed up *after* this bell was
  // already mounted — the first load (everything "unread" from before the
  // page opened) must stay silent, or every login would sound an alarm.
  useEffect(() => {
    if (isLoading) return;
    const ids = new Set(visible.map((n) => n.id));
    if (seenIds.current === null) {
      seenIds.current = ids;
      return;
    }
    const isNew = [...ids].some((id) => !seenIds.current!.has(id));
    if (isNew) playNotificationChime();
    seenIds.current = ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible.map((n) => n.id).join(","), isLoading]);

  if (!me || me.access_role === "developer") return null;

  async function markRead(n: AppNotification) {
    if (n.read_by.includes(myEmail)) return;
    await updateRow("notifications", n.id, { read_by: [...n.read_by, myEmail] });
    void qc.invalidateQueries({ queryKey: ["notifications"] });
  }

  async function markAllRead() {
    await Promise.all(
      unread.map((n) => updateRow("notifications", n.id, { read_by: [...n.read_by, myEmail] })),
    );
    void qc.invalidateQueries({ queryKey: ["notifications"] });
  }

  async function openNotification(n: AppNotification) {
    setOpen(false);
    await markRead(n);
    void navigate({ to: n.link });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          {unread.length > 0 ? <BellRing className="size-4" /> : <Bell className="size-4" />}
          {unread.length > 0 ? (
            <span className="bg-primary text-primary-foreground absolute -top-1 -right-1 grid size-4 place-items-center rounded-full text-[9px] font-bold">
              {unread.length > 9 ? "9+" : unread.length}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-border flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          {unread.length > 0 ? (
            <button
              onClick={() => void markAllRead()}
              className="text-primary text-xs font-medium hover:underline"
            >
              Mark all read
            </button>
          ) : null}
        </div>
        <ul className="sidebar-scroll max-h-96 divide-y divide-border overflow-y-auto">
          {visible.length === 0 ? (
            <li className="text-muted-foreground px-4 py-8 text-center text-sm">
              Nothing yet — you'll see it here the moment it happens.
            </li>
          ) : (
            visible.slice(0, 25).map((n) => {
              const Icon = TYPE_ICON[n.type] ?? Bell;
              const isUnread = !n.read_by.includes(myEmail);
              return (
                <li key={n.id}>
                  <button
                    onClick={() => void openNotification(n)}
                    className={`hover:bg-muted/60 flex w-full items-start gap-2.5 px-4 py-3 text-left transition-colors ${
                      isUnread ? "bg-primary/[0.04]" : ""
                    }`}
                  >
                    <span
                      className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ${
                        isUnread ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <Icon className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block text-sm ${isUnread ? "font-semibold" : "font-medium"}`}
                      >
                        {n.message}
                      </span>
                      <span className="text-muted-foreground text-xs">{timeAgo(n.created_at)}</span>
                    </span>
                    {isUnread ? (
                      <span className="bg-primary mt-1.5 size-1.5 shrink-0 rounded-full" />
                    ) : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
