import { redirect } from "next/navigation";

// Market creation is open to everyone now; the old owner page points to it.
export default function AdminPage() {
  redirect("/ask");
}
