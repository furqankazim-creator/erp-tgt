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

type OwnerComboboxProps = {
  value?: string;
  onValueChange: (name: string) => void;
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

export function OwnerCombobox({
  value,
  onValueChange,
  placeholder = "Select owner",
  className,
}: OwnerComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const { data: employees, isLoading } = useRows<Employee>("employees");

  const selectedEmployee = React.useMemo(
    () => employees?.find((e) => e.name === value),
    [employees, value],
  );

  const filteredEmployees = React.useMemo(() => {
    const rows = employees ?? [];
    return rows.filter((e) => {
      const searchable = `${e.name} ${e.department ?? ""}`.toLowerCase();
      return searchable.length > 0;
    });
  }, [employees]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between text-sm font-normal",
            !value && "text-muted-foreground",
            className,
          )}
        >
          {selectedEmployee ? (
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Avatar className="size-6 shrink-0">
                <AvatarFallback className="gradient-primary text-primary-foreground text-[10px] font-bold">
                  {initials(selectedEmployee.name)}
                </AvatarFallback>
              </Avatar>
              <span className="truncate">{selectedEmployee.name}</span>
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
              {filteredEmployees.map((employee) => (
                <CommandItem
                  key={employee.id}
                  value={`${employee.name} ${employee.department ?? ""}`}
                  onSelect={() => {
                    onValueChange(employee.name);
                    setOpen(false);
                  }}
                  className="py-2"
                >
                  <Avatar className="size-8 shrink-0">
                    <AvatarFallback className="bg-primary/15 text-primary text-xs font-bold">
                      {initials(employee.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{employee.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {employee.role ?? "No role"}
                      {employee.department ? ` · ${employee.department}` : ""}
                    </p>
                  </div>
                  <Check
                    className={cn(
                      "size-4 shrink-0",
                      employee.name === value ? "opacity-100" : "opacity-0",
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
