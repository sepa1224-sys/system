"use client";

import { useState, useEffect, useCallback } from "react";
import Nav from "@/components/Nav";

// 発注リスト。
// ストック確認で「倉庫に無かった」ものがそのまま並ぶ。
// 数を決めてリンクから買い、「発注した」を押すと記録される。
// 記録された分は届くまでこのリストから消えるので、
// 3日後にもう一度在庫確認をしても二重に発注しない。

type Candidate = {
  itemId: string;
  name: string;
  group: string;
  unit: string;
  par: number;
  qty: number;
  url?: string;
  supplier?: string;
  price?: number;
  needsLink?: boolean;
};
type Line = { itemId: string; name: string; unit: string; qty: number; url?: string; supplier?: string };
type Order = { id: string; orderedAt: string; lines: Line[]; arrivedAt?: string; note?: string };
type Stat = {
  itemId: string; name: string; group: string;
  shortCount: number; checkCount: number;
  orderCount: number; orderedQty: number; unit: string;
  lastOrderedAt?: string; leadDays?: number;
};

const md = (d: string) => d.slice(5).replace("-", "/");

export default function PurchasePage() {
  const [checkDate, setCheckDate] = useState<string | null>(null);
  const [cands, setCands] = useState<Candidate[]>([]);
  const [toPrepare, setToPrepare] = useState<{ itemId: string; name: string; unit: string }[]>([]);
  const [waiting, setWaiting] = useState<{ itemId: string; name: string; orderedAt: string }[]>([]);
  const [open, setOpen] = useState<Order[]>([]);
  const [history, setHistory] = useState<Order[]>([]);
  const [today, setToday] = useState("");
  const [stats, setStats] = useState<Stat[]>([]);
  const [statFrom, setStatFrom] = useState<string | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [pick, setPick] = useState<Record<string, boolean>>({});
  const [qty, setQty] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/purchase");
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "取得失敗");
      setCheckDate(d.checkDate ?? null);
      setCands(d.candidates || []);
      setToPrepare(d.toPrepare || []);
      setWaiting(d.waiting || []);
      setOpen(d.open || []);
      setHistory(d.history || []);
      setToday(d.today || "");
      setStats(d.stats?.stats || []);
      setStatFrom(d.stats?.from ?? null);
      const q: Record<string, string> = {};
      const p: Record<string, boolean> = {};
      for (const c of d.candidates || []) {
        q[c.itemId] = String(c.qty);
        p[c.itemId] = true;
      }
      setQty(q);
      setPick(p);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "取得失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const picked = cands.filter((c) => pick[c.itemId]);

  const submit = async () => {
    if (!picked.length) return;
    setSaving(true);
    setErr("");
    setMsg("");
    try {
      const lines: Line[] = picked.map((c) => ({
        itemId: c.itemId,
        name: c.name,
        unit: c.unit,
        qty: Math.max(1, Number(qty[c.itemId]) || 1),
        url: c.url,
        supplier: c.supplier,
      }));
      const res = await fetch("/api/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines, note: note.trim() || undefined }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "保存失敗");
      setMsg(`${lines.length}品を発注済みにしました。届いたら「業務チェック」で押してください`);
      setNote("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存失敗");
    } finally {
      setSaving(false);
    }
  };

  const arrive = async (id: string) => {
    try {
      const res = await fetch("/api/purchase", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "更新失敗");
    }
  };

  const cancel = async (id: string) => {
    if (!confirm("この発注の記録を消します。届いていないものが発注リストに戻ります。")) return;
    try {
      const res = await fetch("/api/purchase", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "削除失敗");
    }
  };

  const groups = [...new Set(cands.map((c) => c.group))];

  return (
    <div className="wrap">
      <header>
        <h1>📋 発注リスト</h1>
        <p>ストック確認で倉庫に無かったものが並びます</p>
      </header>
      <Nav />

      {err && <p className="err">{err}</p>}
      {msg && (
        <div className="card" style={{ padding: "10px 12px", fontSize: 13, fontWeight: 700, color: "var(--ok)" }}>
          {msg}
        </div>
      )}

      {loading && <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>読み込み中…</div>}

      {!loading && (
        <>
          {/* まだ届いていない発注 */}
          {open.length > 0 && (
            <div className="card" style={{ padding: "12px 14px" }}>
              <div className="cat-title">🚚 届き待ち（{open.length}件）</div>
              {open.map((o) => (
                <div key={o.id} style={{ borderTop: "1px solid var(--line-soft, #eee)", padding: "10px 0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <strong style={{ fontSize: 13.5 }}>
                      {md(o.orderedAt)} 発注・{o.lines.length}品
                    </strong>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() => arrive(o.id)}
                        style={{
                          padding: "7px 13px", borderRadius: 8, border: "none", cursor: "pointer",
                          background: "var(--ok)", color: "#fff", fontSize: 12.5, fontWeight: 700,
                        }}
                      >
                        届いた
                      </button>
                      <button
                        onClick={() => cancel(o.id)}
                        style={{
                          padding: "7px 10px", borderRadius: 8, cursor: "pointer",
                          border: "1px solid var(--line)", background: "#fff",
                          color: "var(--muted)", fontSize: 12.5,
                        }}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4, lineHeight: 1.7 }}>
                    {o.lines.map((l) => `${l.name} ${l.qty}${l.unit}`).join("・")}
                  </div>
                  {o.note && (
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>メモ: {o.note}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 発注するもの */}
          <div className="card" style={{ padding: "12px 14px" }}>
            <div className="cat-title">
              🛒 発注するもの（{cands.length}品）
              {checkDate && (
                <span style={{ fontWeight: 400, fontSize: 11.5, color: "var(--muted)", marginLeft: 6 }}>
                  {md(checkDate)}のストック確認より
                </span>
              )}
            </div>

            {!checkDate && (
              <p className="hint" style={{ margin: "8px 0" }}>
                まだストック確認の記録がありません。「📦 ストック確認」で先に記録してください。
              </p>
            )}

            {checkDate && cands.length === 0 && (
              <p className="hint" style={{ margin: "8px 0" }}>
                いま発注するものはありません。
              </p>
            )}

            {groups.map((g) => (
              <div key={g} style={{ marginTop: 6 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", marginTop: 8 }}>{g}</div>
                {cands.filter((c) => c.group === g).map((c) => (
                  <div
                    key={c.itemId}
                    style={{
                      display: "flex", gap: 10, alignItems: "flex-start",
                      padding: "10px 2px", borderTop: "1px solid var(--line-soft, #eee)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!!pick[c.itemId]}
                      onChange={(e) => setPick((p) => ({ ...p, [c.itemId]: e.target.checked }))}
                      style={{ width: 20, height: 20, marginTop: 2, flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</div>
                      <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>
                        ストックに置く数 {c.par}{c.unit}
                        {c.supplier && `・${c.supplier}`}
                        {c.price ? `・¥${c.price.toLocaleString()}` : ""}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                        <input
                          type="number"
                          min={1}
                          value={qty[c.itemId] ?? "1"}
                          onChange={(e) => setQty((p) => ({ ...p, [c.itemId]: e.target.value }))}
                          style={{ width: 60, fontSize: 14, padding: "6px 8px", textAlign: "center" }}
                        />
                        <span style={{ fontSize: 12, color: "var(--muted)" }}>{c.unit}</span>
                        {c.url ? (
                          <a
                            href={c.url}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              fontSize: 12.5, fontWeight: 700, padding: "6px 12px", borderRadius: 7,
                              background: "var(--accent)", color: "#fff", textDecoration: "none",
                            }}
                          >
                            発注ページを開く ↗
                          </a>
                        ) : (
                          <span style={{ fontSize: 11.5, color: "#c0392b", fontWeight: 700 }}>
                            発注先が未設定（「🛒 仕入れ」に登録してください）
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}

            {cands.length > 0 && (
              <div style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="メモ（任意）例: 週末に届く予定"
                  style={{ width: "100%", fontSize: 13, padding: "8px 10px", marginBottom: 8 }}
                />
                <button
                  onClick={submit}
                  disabled={saving || !picked.length}
                  style={{
                    width: "100%", padding: "12px", borderRadius: 9, border: "none",
                    background: picked.length ? "var(--accent)" : "var(--line)",
                    color: "#fff", fontSize: 14.5, fontWeight: 800,
                    cursor: picked.length ? "pointer" : "default",
                  }}
                >
                  {saving ? "記録中…" : `選んだ${picked.length}品を発注済みにする`}
                </button>
                <p className="hint" style={{ marginTop: 6 }}>
                  発注済みにすると、届くまでこのリストから消えます。<br />
                  次のストック確認でまた「倉庫に無い」と記録しても、二重には出ません。
                </p>
              </div>
            )}
          </div>

          {/* 発注済みで届き待ちのため今回出さなかったもの */}
          {waiting.length > 0 && (
            <div className="card" style={{ padding: "12px 14px" }}>
              <div className="cat-title">⏳ 発注済みなので出していないもの（{waiting.length}品）</div>
              {waiting.map((w) => (
                <div key={w.itemId} style={{ fontSize: 13, padding: "7px 0", borderTop: "1px solid var(--line-soft, #eee)" }}>
                  {w.name}
                  <span style={{ fontSize: 11.5, color: "var(--muted)", marginLeft: 6 }}>
                    {w.orderedAt ? `${md(w.orderedAt)}に発注済み` : "発注済み"}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* 仕込みで足すもの */}
          {toPrepare.length > 0 && (
            <div className="card" style={{ padding: "12px 14px" }}>
              <div className="cat-title">🍳 発注ではなく仕込むもの（{toPrepare.length}品）</div>
              {toPrepare.map((t) => (
                <div key={t.itemId} style={{ fontSize: 13, padding: "7px 0", borderTop: "1px solid var(--line-soft, #eee)" }}>
                  {t.name}
                </div>
              ))}
            </div>
          )}

          {history.length > 0 && (
            <div className="card" style={{ padding: "12px 14px" }}>
              <div className="cat-title">📜 届いた分</div>
              {history.map((o) => (
                <div key={o.id} style={{ fontSize: 12.5, padding: "8px 0", borderTop: "1px solid var(--line-soft, #eee)", lineHeight: 1.7 }}>
                  <strong>{md(o.orderedAt)}発注 → {o.arrivedAt ? md(o.arrivedAt) : ""}着</strong>
                  <span style={{ color: "var(--muted)", marginLeft: 6 }}>
                    （{o.arrivedAt ? `${Math.round((Date.parse(o.arrivedAt) - Date.parse(o.orderedAt)) / 86400000)}日` : ""}）
                  </span>
                  <div style={{ color: "var(--muted)" }}>
                    {o.lines.map((l) => `${l.name} ${l.qty}${l.unit}`).join("・")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* 切らしやすいものと、届くまでの日数。適正在庫を決め直すのに使う */}
      {stats.length > 0 && (
        <div className="card" style={{ padding: "12px 14px" }}>
          <div
            className="cat-title"
            onClick={() => setShowStats((v) => !v)}
            style={{ cursor: "pointer", display: "flex", justifyContent: "space-between" }}
          >
            <span>📊 切らしやすいもの</span>
            <span style={{ fontWeight: 400, color: "var(--muted)" }}>{showStats ? "閉じる" : "開く"}</span>
          </div>
          {showStats && (
            <>
              <p className="hint" style={{ margin: "6px 0 10px" }}>
                {statFrom ? `${md(statFrom)}以降の在庫確認から集計` : ""}。
                切らす回数が多いものは、ストックルームに置く数が少なすぎます。
                届くまでの日数が在庫確認の間隔（3日）より長いものは、早めに頼まないと間に合いません。
              </p>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--muted)" }}>
                      <th style={{ padding: "6px 4px" }}>品目</th>
                      <th style={{ padding: "6px 4px", whiteSpace: "nowrap" }}>切らした</th>
                      <th style={{ padding: "6px 4px", whiteSpace: "nowrap" }}>発注</th>
                      <th style={{ padding: "6px 4px", whiteSpace: "nowrap" }}>届くまで</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.filter((st) => st.shortCount > 0 || st.orderCount > 0).map((st) => (
                      <tr key={st.itemId} style={{ borderTop: "1px solid var(--line-soft, #eee)" }}>
                        <td style={{ padding: "7px 4px" }}>{st.name}</td>
                        <td style={{ padding: "7px 4px", whiteSpace: "nowrap" }}>
                          <strong>{st.shortCount}</strong>
                          <span style={{ color: "var(--muted)" }}>/{st.checkCount}回</span>
                        </td>
                        <td style={{ padding: "7px 4px", whiteSpace: "nowrap" }}>
                          {st.orderCount ? `${st.orderCount}回 ${st.orderedQty}${st.unit}` : "—"}
                        </td>
                        <td style={{ padding: "7px 4px", whiteSpace: "nowrap" }}>
                          {st.leadDays != null ? `${st.leadDays}日` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      <p className="hint" style={{ textAlign: "center", marginTop: 12 }}>
        今日 {today && md(today)}
      </p>
    </div>
  );
}
