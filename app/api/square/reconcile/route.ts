import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const SQUARE_API = "https://connect.squareup.com/v2";
const SQUARE_VERSION = "2024-11-20";
function hdrs() {
  return {
    "Square-Version": SQUARE_VERSION,
    Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN || ""}`,
    "Content-Type": "application/json",
  };
}

// Square POSで会計したのに、システム側の注文がOPENのまま残ってしまう問題の後始末。
//
// カード会計はSquareアプリへ飛ばして戻ってくる作りだが、
// 戻りのコールバックが届かないとOPEN注文が閉じられない
// （アプリを切り替えた・Safariに戻らなかった等で普通に起きる）。
//
// そこで「同じ日に同じ金額の会計済み注文があるOPEN注文」を探して閉じる。
// 金額と日付が一致していれば、その会計はこの注文のものとみなせる。
//
// 閉じ方はCANCELED。決済が紐づいていない注文はCOMPLETEDにできないため。
// 売上は会計済み(COMPLETED)の方で立っているので、二重計上にはならない。
// dryRun=false を付けたときだけ実際に閉じる。

type Order = {
  id: string;
  version: number;
  state: string;
  created_at: string;
  ticket_name?: string;
  total_money?: { amount: number };
  tenders?: unknown[];
};

// ロケーションIDは環境変数ではなくAPIから引く（他の画面と同じ取り方に揃える）
async function getLocationId(): Promise<string> {
  const res = await fetch(`${SQUARE_API}/locations`, { headers: hdrs() });
  const data = await res.json();
  return data.locations?.[0]?.id || "";
}

async function search(location: string, states: string[], beginISO: string): Promise<Order[]> {
  const out: Order[] = [];
  let cursor: string | undefined;
  do {
    const res = await fetch(`${SQUARE_API}/orders/search`, {
      method: "POST",
      headers: hdrs(),
      body: JSON.stringify({
        location_ids: [location],
        cursor,
        limit: 200,
        query: {
          filter: {
            state_filter: { states },
            date_time_filter: { created_at: { start_at: beginISO } },
          },
          sort: { sort_field: "CREATED_AT", sort_order: "DESC" },
        },
      }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.errors?.[0]?.detail || `検索に失敗(${res.status})`);
    out.push(...(d.orders ?? []));
    cursor = d.cursor;
  } while (cursor && out.length < 600);
  return out;
}

export async function POST(req: NextRequest) {
  try {
    const b = (await req.json().catch(() => ({}))) as { dryRun?: boolean; days?: number };
    const dryRun = b.dryRun !== false;
    const days = b.days ?? 30;

    const begin = new Date(Date.now() - days * 86400_000).toISOString();
    const location = await getLocationId();
    if (!location) {
      return NextResponse.json({ error: "ロケーションが取得できません" }, { status: 500 });
    }
    const [open, completed] = await Promise.all([
      search(location, ["OPEN"], begin),
      search(location, ["COMPLETED"], begin),
    ]);

    // 会計済みの注文を「営業日 + 金額」で引けるようにする。
    // 6時前は前営業日に寄せる（深夜まで営業しているため）
    const bizDay = (iso: string) => {
      const jst = new Date(new Date(iso).getTime() + 9 * 3600_000);
      if (jst.getUTCHours() < 6) jst.setUTCDate(jst.getUTCDate() - 1);
      return jst.toISOString().slice(0, 10);
    };
    const paid = new Map<string, Order[]>();
    for (const c of completed) {
      const k = `${bizDay(c.created_at)}_${c.total_money?.amount ?? 0}`;
      (paid.get(k) ?? paid.set(k, []).get(k)!).push(c);
    }

    const used = new Set<string>();
    const matched: {
      openId: string;
      ticket: string;
      amount: number;
      paidId: string;
      paidAt: string;
      closed?: boolean;
      error?: string;
    }[] = [];

    for (const o of open) {
      const amount = o.total_money?.amount ?? 0;
      if (!amount) continue;
      const k = `${bizDay(o.created_at)}_${amount}`;
      const hit = (paid.get(k) ?? []).find((c) => !used.has(c.id));
      if (!hit) continue;
      used.add(hit.id);
      const row = {
        openId: o.id,
        ticket: o.ticket_name || "",
        amount,
        paidId: hit.id,
        paidAt: hit.created_at,
      };
      if (!dryRun) {
        const res = await fetch(`${SQUARE_API}/orders/${o.id}`, {
          method: "PUT",
          headers: hdrs(),
          body: JSON.stringify({
            // COMPLETEDにはできない（決済が紐づいていないとSquareが拒否する）。
            // 会計自体は別の注文で済んでいるので、こちらはCANCELEDで閉じる。
            // 売上はCOMPLETED側で計上済みなので、二重計上にはならない。
            order: { version: o.version, state: "CANCELED" },
            idempotency_key: `rec_${o.id.slice(-10)}_${Date.now().toString(36)}`,
          }),
        });
        if (res.ok) Object.assign(row, { closed: true });
        else {
          const d = await res.json().catch(() => ({}));
          Object.assign(row, { error: d.errors?.[0]?.detail || `失敗(${res.status})` });
        }
      }
      matched.push(row);
    }

    return NextResponse.json({
      dryRun,
      openCount: open.length,
      matched: matched.length,
      closed: matched.filter((m) => m.closed).length,
      results: matched,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "エラー" },
      { status: 500 },
    );
  }
}
