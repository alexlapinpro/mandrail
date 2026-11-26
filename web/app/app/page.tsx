import type { Metadata } from "next";
import { SiteNav } from "@/components/SiteNav";
import { Workspace } from "@/components/Workspace";

export const metadata: Metadata = { title: "App | Mandrail" };

export default function AppPage() {
  return (
    <>
      <SiteNav wallet />
      <Workspace />
    </>
  );
}
