import { ScriptId } from "./storage";

export const SCRIPTS: { id: ScriptId; label: string; description: string }[] = [
  {
    id: "neet-reactivation",
    label: "NEET PG Reactivation",
    description: "Re-engages past inquiries who haven't enrolled yet. Asks about exam target, attempt stage, and budget concerns.",
  },
  {
    id: "fee-reminder",
    label: "Fee Reminder",
    description: "Friendly reminder call for upcoming or overdue fee payments, with an option to connect to accounts.",
  },
  {
    id: "new-batch",
    label: "New Batch Announcement",
    description: "Tells past inquiries about a newly opening batch and offers to book a trial class.",
  },
  {
    id: "custom",
    label: "Custom (use my Agent instructions)",
    description: "Uses whatever you've written on the Agent page instead of a preset script.",
  },
];
