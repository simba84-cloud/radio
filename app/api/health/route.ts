import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// pg often throws an AggregateError (one entry per resolved address) whose own
// .message is empty, so fall back to the causes and the errno code.
function describe(err: unknown): string {
  if (err instanceof AggregateError && err.errors.length) {
    return err.errors.map(describe).join("; ");
  }
  if (err instanceof Error) {
    const code = (err as NodeJS.ErrnoException).code;
    const addr = (err as { address?: string; port?: number });
    const where = addr.address ? ` (${addr.address}:${addr.port})` : "";
    return err.message || `${code ?? err.name}${where}`;
  }
  return String(err);
}

export async function GET() {
  try {
    const rows = await query<{ now: string }>("select now()");
    return NextResponse.json({ ok: true, db: "up", now: rows[0].now });
  } catch (err) {
    return NextResponse.json(
      { ok: false, db: "down", error: describe(err) },
      { status: 503 },
    );
  }
}
