import { redirect } from "next/navigation";

// Old page (from before Script Studio). Employees are built and edited under My Employees now.
export default function Page() {
  redirect("/employees");
}
