"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { useRows } from "@/lib/db";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

export type ClientContact = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  company: string | null;
  account_id?: string | null;
};

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Search across every known contact (past inquiries, CRM leads, account
 * contacts) so Admin can pull up a returning client instead of retyping
 * everything from scratch. */
export function ClientCombobox({
  onSelect,
  placeholder = "Search existing clients…",
  className,
}: {
  onSelect: (contact: ClientContact) => void;
  placeholder?: string | undefined;
  className?: string | undefined;
}) {
  const [open, setOpen] = React.useState(false);
  const { data, isLoading } = useRows<ClientContact>("contacts");
  const contacts = data ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between text-sm font-normal text-muted-foreground",
            className,
          )}
        >
          <span className="flex-1 truncate text-left">{placeholder}</span>
          <ChevronDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="surface-card w-[320px] p-0" align="start">
        <Command className="text-sm">
          <CommandInput placeholder="Search by name, company or email…" />
          <CommandList className="sidebar-scroll max-h-[320px]">
            <CommandEmpty>
              {isLoading ? "Loading clients…" : "No match — this looks like a new client."}
            </CommandEmpty>
            <CommandGroup>
              {contacts.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`${c.name} ${c.company ?? ""} ${c.email ?? ""}`}
                  onSelect={() => {
                    onSelect(c);
                    setOpen(false);
                  }}
                  className="py-2"
                >
                  <Avatar className="size-8 shrink-0">
                    <AvatarFallback className="bg-primary/15 text-primary text-xs font-bold">
                      {initials(c.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.company ?? "No company"}
                      {c.email ? ` · ${c.email}` : ""}
                    </p>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
