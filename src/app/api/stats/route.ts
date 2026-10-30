import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const GOOGLE_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbxnozrFJ9z1X2TMsO-S1TJm70bu-mreYtuOqU96Oyu_hArYspQaQPvv9rbNeRX8zaGt/exec";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const unique = searchParams.get("unique") === "1" ? "1" : "0";
  const today = searchParams.get("today") === "1" ? "1" : "0";
  const session = searchParams.get("session") === "1" ? "1" : "0";

  const targetUrl = `${GOOGLE_SCRIPT_URL}?action=hit&unique=${unique}&today=${today}&session=${session}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(targetUrl, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { ok: false, error: `Upstream HTTP ${response.status}` },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }

    const data = await response.json();

    return NextResponse.json(
      {
        ok: Boolean(data?.ok ?? true),
        totalUnique: Number(data?.totalUnique ?? 0),
        todayVisits: Number(data?.todayVisits ?? 0),
        totalViews: Number(data?.totalViews ?? 0),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "Stats service unreachable" },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
