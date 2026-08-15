import { NextResponse } from "next/server";
import { getReceipts } from "@/lib/receipts";
import { isGoogleConnected, sheetsGet } from "@/lib/google";
import { getKintai, toRows } from "@/lib/kintai";
import {
  computeHours,
  HOURLY_RATE,
  KINTAI_SHEET_ID,
  KINTAI_RANGE,
  MEMBERS,
} from "@/lib/labor";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  try {
    // 勤怠はKV（/kintai）が正。KVが空のときだけ旧Googleシートを読む（移行前の保険）。
    let rows: (string | number)[][] = [];
    const kintai = await getKintai();
    if (kintai.length > 0) {
      rows = toRows(kintai);
    } else if (await isGoogleConnected()) {
      rows = await sheetsGet(KINTAI_SHEET_ID, KINTAI_RANGE);
    }
    const hours = computeHours(rows);

    const receipts = await getReceipts();
    const laborReceipts = receipts.filter((r) => r.expenseKind === "labor" && r.laborMember);

    const used: Record<string, number> = {};
    for (const r of laborReceipts) {
      used[r.laborMember!] = (used[r.laborMember!] ?? 0) + r.total;
    }

    const members = MEMBERS.map((m) => {
      const h = hours[m]?.hours ?? 0;
      const days = hours[m]?.days ?? 0;
      const earned = Math.round(h * HOURLY_RATE);
      const u = used[m] ?? 0;
      return { member: m, hours: h, days, earned, used: u, remaining: earned - u };
    });

    // 労働枠で使った領収書の明細（表示用）
    const items = laborReceipts.map((r) => ({
      id: r.id,
      date: r.date,
      vendor: r.vendor,
      total: r.total,
      category: r.category,
      memo: r.memo,
      member: r.laborMember,
    }));

    return NextResponse.json({ connected: true, rate: HOURLY_RATE, members, items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "取得に失敗";
    return NextResponse.json({ connected: true, error: msg, members: [], items: [] });
  }
}
