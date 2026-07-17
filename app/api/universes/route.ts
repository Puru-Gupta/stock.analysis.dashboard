import { NextResponse } from "next/server";
import { SECTORS, UNIVERSES } from "@/lib/data/universes";

export async function GET() {
  return NextResponse.json({
    universes: [...Object.keys(UNIVERSES), "sector", "custom"],
    sectors: Object.keys(SECTORS),
  });
}
