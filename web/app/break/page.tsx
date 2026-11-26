import type { Metadata } from "next";
import { BreakRoom } from "@/components/BreakRoom";
import { SiteNav } from "@/components/SiteNav";

export const metadata: Metadata = { title: "Break my agent | Mandrail" };

export default function Break() {
  return (
    <>
      <SiteNav />
      <BreakRoom />
    </>
  );
}
