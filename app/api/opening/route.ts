import { NextRequest, NextResponse } from "next/server";
import {
  TASKS,
  WAFFLE_FLAVORS,
  daysBetween,
  getDone,
  getWaffleCounts,
  lastDoneDate,
  morningPlan,
  nightPlan,
  getChoices,
  saveChoice,
  saveWaffleCount,
  setWaffleBaked,
  todayJST,
  toggle,
  yesterdayOf,
} from "@/lib/opening";
import { openOrders } from "@/lib/purchase";
import { dayState, saveCount, saveMade, type Slot } from "@/lib/hotsand";
import {
  dayState as dailyState,
  saveValues as saveDaily,
  type Values as DailyValues,
} from "@/lib/dailycheck";

export const runtime = "nodejs";

// GET /api/opening?date=YYYY-MM-DD → 今日のチェック状況
export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get("date") || todayJST();
    const done = await getDone(date);

    // ワッフルは前夜に数えた残数を朝の判断に使う。
    // 廃棄期限が2日あるので、いつ焼いたものかも見て出し分ける
    const waffle = await getWaffleCounts();
    const yst = waffle[yesterdayOf(date)];
    const tdy = waffle[date];

    // 発注チェックは、届いていない発注があるときだけ出す
    const pending = await openOrders();
    const choices = await getChoices(date);
    const hotsand = await dayState(date);
    const daily = await dailyState(date);
    // 朝と夜のどちらかで足りなければ手当てが要る
    const dailyNeeds = [...daily.morning.needs, ...daily.evening.needs];
    const morning = morningPlan(yst?.counts, yst?.bakedAt, date);
    const night = nightPlan(
      tdy?.counts ?? yst?.counts,
      tdy?.bakedAt ?? yst?.bakedAt,
      date,
      tdy?.baked,
    );

    const tasks = await Promise.all(
      TASKS.map(async (t) => {
        if (t.pendingOrder) {
          return { ...t, done: done.includes(t.id), due: pending.length > 0 };
        }
        if (t.hotsandPrep) {
          // 朝か夕方のどちらかで足りていなければ仕込む
          const need = hotsand.morning.needPrep || hotsand.evening.needPrep;
          return { ...t, done: done.includes(t.id), due: need };
        }
        if (t.dailyAction) {
          return {
            ...t,
            done: done.includes(t.id),
            due: dailyNeeds.some((n) => n.action === t.dailyAction),
          };
        }
        if (t.choices) {
          return { ...t, done: done.includes(t.id), answer: choices[t.id] ?? null };
        }
        if (t.weekday !== undefined) {
          // 曜日が決まっている作業。その曜日以外は「今日はなし」
          const wd = new Date(`${date}T00:00:00Z`).getUTCDay();
          return { ...t, done: done.includes(t.id), due: wd === t.weekday };
        }
        if (!t.everyDays) return { ...t, done: done.includes(t.id) };
        // 何日おきの作業は、前回からの経過で今日やるべきか判断する
        const last = await lastDoneDate(t.id);
        const since = last ? daysBetween(last, date) : null;
        return {
          ...t,
          done: done.includes(t.id),
          lastDate: last,
          daysSince: since,
          due: since === null || since >= t.everyDays,
        };
      }),
    );

    // きょう必要な作業のうち、終わった数
    const need = tasks.filter((t) => !("due" in t) || t.due);
    return NextResponse.json({
      date,
      tasks,
      waffle: {
        flavors: WAFFLE_FLAVORS,
        yesterday: yst?.counts ?? null,
        yesterdayBakedAt: yst?.bakedAt ?? null,
        today: tdy?.counts ?? null,
        // 今朝どちらを押したか
        bakedToday: tdy?.baked === true,
        bakedAt: tdy?.bakedAt ?? null,
        answered: tdy?.baked !== undefined,
        morning,
        night,
      },
      pendingOrders: pending,
      hotsand,
      daily,
      total: need.length,
      doneCount: need.filter((t) => t.done).length,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取得に失敗" },
      { status: 500 },
    );
  }
}

// POST /api/opening
//   { taskId, done, date? }              … チェックの付け外し
//   { choice: { taskId, answer }, date? } … 2択の作業でどちらを選んだか
//   { dailyCount: {...}, date? }         … 牛乳・コールドブリュー・水を数えた結果
//   { hotsandCount: {...}, date? }       … ホットサンドの個数を数えた結果
//   { hotsandMade: {...}, date? }        … ホットサンドを仕込んだ数
//   { waffleBaked: true|false, date? }   … 朝、焼いたか冷蔵庫から出したか
//   { waffleCounts, bakedAt?, date? }    … 夜のワッフル残数の記録
export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as {
      taskId?: string;
      done?: boolean;
      date?: string;
      waffleCounts?: Record<string, number>;
      bakedAt?: string;
      waffleBaked?: boolean;
      choice?: { taskId?: string; answer?: string };
      hotsandCount?: {
        slot?: Slot;
        fridge?: Record<string, number>;
        freezer?: Record<string, number>;
        tane?: boolean;
      };
      hotsandMade?: {
        slot?: Slot;
        fridge?: Record<string, number>;
        freezer?: Record<string, number>;
      };
      dailyCount?: { slot?: Slot; values?: DailyValues };
    };

    if (b.choice?.taskId && b.choice.answer) {
      const date = b.date || todayJST();
      const task = TASKS.find((t) => t.id === b.choice!.taskId);
      if (!task?.choices?.includes(b.choice.answer)) {
        return NextResponse.json({ error: "その選択肢はありません" }, { status: 400 });
      }
      const answers = await saveChoice(date, b.choice.taskId, b.choice.answer);
      // どちらを選んでも「見た」ことに変わりはないので終わりにする
      await toggle(date, b.choice.taskId, true);
      return NextResponse.json({ ok: true, date, answers });
    }

    if (b.dailyCount) {
      const date = b.date || todayJST();
      const slot: Slot = b.dailyCount.slot === "evening" ? "evening" : "morning";
      await saveDaily(date, slot, b.dailyCount.values ?? {});
      await toggle(date, slot === "morning" ? "daily-morning" : "daily-evening", true);
      return NextResponse.json({ ok: true, date, daily: await dailyState(date) });
    }

    if (b.hotsandCount) {
      const date = b.date || todayJST();
      const slot: Slot = b.hotsandCount.slot === "evening" ? "evening" : "morning";
      await saveCount(
        date,
        slot,
        b.hotsandCount.fridge ?? {},
        b.hotsandCount.freezer ?? {},
        !!b.hotsandCount.tane,
      );
      await toggle(date, slot === "morning" ? "hotsand-morning" : "hotsand-evening", true);
      return NextResponse.json({ ok: true, date, hotsand: await dayState(date) });
    }

    if (b.hotsandMade) {
      const date = b.date || todayJST();
      const slot: Slot = b.hotsandMade.slot === "evening" ? "evening" : "morning";
      await saveMade(date, slot, b.hotsandMade.fridge ?? {}, b.hotsandMade.freezer ?? {});
      const st = await dayState(date);
      // 足りた時点で仕込みの作業は終わり
      await toggle(date, "hotsand-prep", !st.morning.needPrep && !st.evening.needPrep);
      return NextResponse.json({ ok: true, date, hotsand: st });
    }

    if (b.waffleBaked !== undefined) {
      const date = b.date || todayJST();
      const bakedAt = await setWaffleBaked(date, b.waffleBaked);
      const all = await getWaffleCounts();
      const plan = nightPlan(
        all[date]?.counts ?? all[yesterdayOf(date)]?.counts,
        bakedAt,
        date,
        b.waffleBaked,
      );
      // 焼いたなら「ワッフルをセットする」も終わったものとして扱う
      await toggle(date, "waffle", true);
      return NextResponse.json({ ok: true, date, bakedAt: bakedAt ?? null, night: plan });
    }
    if (b.waffleCounts) {
      const date = b.date || todayJST();
      await saveWaffleCount(date, b.waffleCounts, b.bakedAt);
      const plan = nightPlan(b.waffleCounts, b.bakedAt, date);
      return NextResponse.json({ ok: true, date, night: plan });
    }
    if (!b.taskId) return NextResponse.json({ error: "taskIdが必要です" }, { status: 400 });
    if (!TASKS.some((t) => t.id === b.taskId)) {
      return NextResponse.json({ error: `知らない作業: ${b.taskId}` }, { status: 400 });
    }
    const date = b.date || todayJST();
    const done = await toggle(date, b.taskId, b.done !== false);
    return NextResponse.json({ ok: true, date, done });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "保存に失敗" },
      { status: 500 },
    );
  }
}
