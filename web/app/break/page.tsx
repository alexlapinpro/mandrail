import type { Metadata } from "next";
import { BreakRoom } from "@/components/BreakRoom";

export const metadata: Metadata = { title: "Break my agent | Mandrail" };

export default function Break() {
  return <BreakRoom />;
}
