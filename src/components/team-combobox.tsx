"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";

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

type Employee = {
  id: string;
  name: string;
  role: string | null;
  department: string | null;
};

type TeamComboboxProps = {
  value: string[];
  onChange: (names: string[]) => void;
  placeholder?: string;
  className?: string;
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

export function TeamCombobox({
  value,
  onChange,
  placeholder = "Select team members",
  className,
}: TeamComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const { data: employees, isLoading } = useRows<Employee>("employees");

  function toggle(name: string) {
    onChange(value.includes(name) ? value.filter((n) => n !== name) : [...value, name]);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between text-sm font-normal",
            !value.length && "text-muted-foreground",
            className,
          )}
        >
          {value.length ? (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="flex -space-x-2">
                {value.slice(0, 4).map((name) => (
                  <Avatar key={name} className="size-6 shrink-0 border-2 border-background">
                    <AvatarFallback className="gradient-primary text-primary-foreground text-[9px] font-bold">
                      {initials(name)}
                    </AvatarFallback>
                  </Avatar>
                ))}
              </div>
              <span className="truncate">
                {value.length} selected{value.length > 4 ? ` (+${value.length - 4})` : ""}
              </span>
            </div>
          ) : (
            <span className="flex-1 text-left">{placeholder}</span>
          )}
          <ChevronDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0 surface-card" align="start">
        <Command className="text-sm">
          <CommandInput placeholder="Search by name or department..." />
          <CommandList className="sidebar-scroll max-h-[320px]">
            <CommandEmpty>
              {isLoading ? "Loading employees..." : "No employees found."}
            </CommandEmpty>
            <CommandGroup>
              {(employees ?? []).map((employee) => {
                const selected = value.includes(employee.name);
                return (
                  <CommandItem
                    key={employee.id}
                    value={`${employee.name} ${employee.department ?? ""}`}
                    onSelect={() => toggle(employee.name)}
                    className="py-2"
                  >
                    <Avatar className="size-8 shrink-0">
                      <AvatarFallback className="bg-primary/15 text-primary text-xs font-bold">
                        {initials(employee.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{employee.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {employee.role ?? "No role"}
                        {employee.department ? ` · ${employee.department}` : ""}
                      </p>
                    </div>
                    <Check
                      className={cn("size-4 shrink-0", selected ? "opacity-100" : "opacity-0")}
                    />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
