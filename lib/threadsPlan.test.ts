import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkText, draftStale, hasContact, nextPostDate, pickTheme, publicEvents, threadsLength, weekday,
  type Announce, type PlanEvent,
} from "./threadsPlan.ts";

const posting = (d: string) => weekday(d) !== 2; // 火曜定休
const run = (date: string): PlanEvent => ({ id: `run-${date}`, title: "ランニングクラブ", date });
const ev = (id: string, date: string, title = "ムービーナイト"): PlanEvent => ({ id, title, date });
const mark = (date: string): Announce => ({ on: true, title: "公開名", line: "19時から", date, srcTitle: "ムービーナイト" });
const off = { on: false, line: "" };
const always = { on: true, line: "20時スタート" };

test("印が無いイベントは公開しない。日付が動いたら印は効かない", () => {
  const e = ev("a", "2026-12-09");
  assert.deepEqual(publicEvents([e], {}, always), []);
  assert.equal(publicEvents([e], { a: mark("2026-12-09") }, off)[0].title, "公開名");
  assert.deepEqual(publicEvents([e], { a: mark("2026-12-08") }, off), []);
});

test("中止と書き足されたら効かない。1回だけやめる印は毎週告知より優先", () => {
  assert.deepEqual(publicEvents([ev("a", "2026-12-09", "【中止】ムービーナイト")], { a: mark("2026-12-09") }, off), []);
  const e = run("2026-12-03");
  const no: Announce = { on: false, title: "", line: "", date: e.date, srcTitle: e.title };
  assert.deepEqual(publicEvents([e], { [e.id]: no }, always), []);
});

test("毎週告知は木曜のランだけ。土曜や貸切は入らない", () => {
  const list = [run("2026-12-03"), ev("s", "2026-12-12", "ランニングクラブ（土曜）"), ev("p", "2026-12-30", "同窓会")];
  assert.deepEqual(publicEvents(list, {}, always).map((e) => e.id), ["run-2026-12-03"]);
});

test("ランは前日の水曜だけ。3日前の月曜には出さない", () => {
  const all = [run("2026-12-03")];
  const pub = publicEvents(all, {}, always);
  assert.equal(pickTheme("2026-12-02", pub, all, posting, undefined).theme, "before");
  assert.notEqual(pickTheme("2026-11-30", pub, all, posting, undefined).theme, "three");
  assert.equal(pickTheme("2026-12-03", pub, all, posting, undefined).events.length, 0);
});

test("前日が定休日なら、その前の投稿日に前日告知", () => {
  const all = [ev("w", "2026-12-09")]; // 水曜
  const pub = publicEvents(all, { w: mark("2026-12-09") }, off);
  assert.equal(pickTheme("2026-12-07", pub, all, posting, undefined).theme, "before");
  assert.equal(pickTheme("2026-12-06", pub, all, posting, undefined).theme, "three");
});

test("3日前が定休日なら、その前の投稿日に出す", () => {
  const all = [ev("f", "2026-12-25")]; // 金曜。3日前は火曜
  const pub = publicEvents(all, { f: mark("2026-12-25") }, off);
  assert.equal(pickTheme("2026-12-21", pub, all, posting, undefined).theme, "three");
  assert.equal(pickTheme("2026-12-24", pub, all, posting, undefined).theme, "before");
});

test("イベントが無い日は順に回す", () => {
  const p = (last?: string) => pickTheme("2026-12-05", [], [run("2026-12-10")], posting, last).theme;
  assert.equal(p(), "yoru");
  assert.equal(p("yoru"), "hours");
  assert.equal(p("place"), "run");
  assert.equal(p("run"), "yoru");
});

test("休みの週はランの紹介を飛ばす。木曜当日も飛ばす", () => {
  assert.equal(pickTheme("2026-11-25", [], [run("2026-12-03")], posting, "place").theme, "yoru");
  assert.equal(pickTheme("2026-11-26", [], [run("2026-12-03")], posting, "place").theme, "yoru");
  assert.equal(pickTheme("2026-11-27", [], [run("2026-12-03")], posting, "place").theme, "run");
});

test("下書きのあとでイベントが消えた・動いた・文が変わったら古い", () => {
  const all = [ev("a", "2026-12-09")];
  const used = publicEvents(all, { a: mark("2026-12-09") }, off);
  assert.equal(draftStale(used, "before", "2026-12-07", used, all), false);
  assert.equal(draftStale(used, "before", "2026-12-07", [], []), true);
  assert.equal(draftStale(used, "before", "2026-12-07", [{ ...used[0], line: "20時から" }], all), true);
  assert.equal(draftStale([], "run", "2026-12-05", [], []), true);
  assert.equal(draftStale([], "yoru", "2026-12-05", [], []), false);
});

test("字数は絵文字をバイトで数える", () => {
  assert.equal(threadsLength("あいう"), 3);
  assert.equal(threadsLength("☕"), 3);
  assert.equal(threadsLength("🏃"), 4);
  assert.equal(threadsLength("20時"), 3);
});

test("電話番号・メールを見つける。時刻や日付は通す", () => {
  for (const s of ["080-5343-2895", "０７４９－４６－５３５５", "0749465355", "a.b@example.com", "0749(46)5355", "090.1234.5678", "0749 46 5355"]) assert.equal(hasContact(s), true, s);
  for (const s of ["12/10（木）20:00〜", "19:50集合 20:00スタート", "10:00〜18:00／19:00〜24:00 LO23:30", "キロ5分〜5分30秒", "彦根市京町二丁目3-1", "2026-12-10", "開場19:00 1500円", "10:00-18:00 19:00-24:00"])
    assert.equal(hasContact(s), false, s);
});

test("金額は公開用の一文にあるものだけ。24時半は注意", () => {
  assert.equal(checkText("参加費500円です", []).warnings.length, 1);
  assert.equal(checkText("参加費500円です", ["参加費は５００円"]).warnings.length, 0);
  assert.equal(checkText("¥1,600", ["1600円"]).warnings.length, 0);
  assert.equal(checkText("24時半まで", []).warnings.length, 1);
  assert.equal(checkText("20時半から", []).warnings.length, 0);
  assert.equal(checkText("あ".repeat(501), []).errors.length, 1);
});

test("次の投稿日は定休日を飛ばす", () => {
  assert.equal(nextPostDate({ date: "2026-11-30", minutes: 1200 }, 1140, posting), "2026-12-02");
  assert.equal(nextPostDate({ date: "2026-11-30", minutes: 600 }, 1140, posting), "2026-11-30");
});
