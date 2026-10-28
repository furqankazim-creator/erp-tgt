import { useState } from "react";
import { Trash2 } from "lucide-react";

import { useDeleteRow, type TableName } from "@/lib/db";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function DeleteButton({
  table,
  id,
  label,
  name,
}: {
  table: TableName;
  id: string;
  label: string;
  name?: string;
}) {
  const [open, setOpen] = useState(false);
  const remove = useDeleteRow(table, label);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-destructive size-8"
          aria-label={`Delete ${label}`}
        >
          <Trash2 className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Move {label.toLowerCase()} to Trash?</AlertDialogTitle>
          <AlertDialogDescription>
            {name
              ? `“${name}” will be moved to Trash. You can restore it anytime within 30 days.`
              : "This item will be moved to Trash. You can restore it anytime within 30 days before it is permanently deleted."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => remove.mutate(id)}
          >
            Move to Trash
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
