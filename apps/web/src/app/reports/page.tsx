import { redirect } from "next/navigation";
import { lastFullMonth } from "@/lib/report";
export default function Reports() { redirect(`/reports/${lastFullMonth()}`); }
