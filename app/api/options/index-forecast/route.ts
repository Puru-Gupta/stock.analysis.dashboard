import { NextResponse } from "next/server";
import { buildIndexForecastBundle } from "@/lib/engines/index-forecast";

export const maxDuration = 120;

export async function GET() {
  try {
    const data = await buildIndexForecastBundle();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Index forecast failed" },
      { status: 500 },
    );
  }
}
