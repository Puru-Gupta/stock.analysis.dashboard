import { NextResponse } from "next/server";
import { FUTURISTIC_THEMES, SECTORS, UNIVERSES } from "@/lib/data/universes";

export async function GET() {
  return NextResponse.json({
    universes: [...Object.keys(UNIVERSES), "sector", "custom"],
    sectors: Object.keys(SECTORS),
    futuristic_themes: Object.fromEntries(
      Object.entries(FUTURISTIC_THEMES).map(([k, v]) => [k, { label: v.label, count: v.symbols.length }]),
    ),
  });
}
