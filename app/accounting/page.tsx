"use client";

import { useState, useEffect, useCallback } from "react";
import Nav from "@/components/Nav";

type MonthlyData = {
  ym: string;
  carryover: number; additionalFunds: number; additionalFundsMemo: string;
  costCoffeeBeans: number; costMilkSyrup: number; costFoodMaterials: number;
  costPackaging: number; costOther: number;
  expRent: number; expUtilities: number; expTelecom: number; expInsurance: number;
  expLabor: number; expSupplies: number; expAdvertising: number; expRepair: number;
  expOther: number; expDepreciation: number;
  bulkExpenses: { name: string; amount: number }[];
  operatingDays: number; visitors: number;
  memo: string;
};

type SalesSummary = { totalSales: number; orderCount: number };
type SalesByProduct = { name: string; qty: number; amount: number }[];

const fmt = (n: number) => `¥${Math.round(n).toLocaleString()}`;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

const MONTHS = ["04","05","06","07","08","09","10","11","12","01","02","03"];
const MONTH_LABELS = ["4月","5月","6月","7月","8月","9月","10月","11月","12月","1月","2月","3月"];

function currentYM() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function daysInMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export default function AccountingPage() {
  const [ym, setYm] = useState(currentYM());
  const [data, setData] = useState<MonthlyData | null>(null);
  const [sales, setSales] = useState<SalesSummary>({ totalSales: 0, orderCount: 0 });
  const [byProduct, setByProduct] = useState<SalesByProduct>([]);
  const [tab, setTab] = useState<"pl" | "cost" | "expense" | "report">("pl");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [reportData, setReportData] = useState<any[]>([]);

  // 月次データ取得
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [accRes, salesRes] = await Promise.all([
        fetch(`/api/accounting?ym=${ym}`),
        fetch(`/api/square/sales?from=${ym}-01&to=${ym}-${daysInMonth(ym)}`),
      ]);
      const accData = await accRes.json();
      const salesData = await salesRes.json();
      setData(accData);
      setSales(salesData.summary || { totalSales: 0, orderCount: 0 });
      setByProduct(salesData.byProduct || []);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [ym]);

  useEffect(() => { loadData(); }, [loadData]);

  // レポート取得
  const loadReport = useCallback(async () => {
    try {
      const res = await fetch("/api/accounting?all=1");
      const d = await res.json();
      setReportData(d.months || []);
    } catch {}
  }, []);

  useEffect(() => { if (tab === "report") loadReport(); }, [tab, loadReport]);

  // フィールド更新
  const update = (field: string, value: number | string) => {
    if (!data) return;
    setData({ ...data, [field]: value });
  };

  // 保存
  const save = async () => {
    if (!data) return;
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/accounting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setMsg("保存しました");
      setTimeout(() => setMsg(""), 2000);
    } catch (e: any) {
      setMsg(`エラー: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  // 一括経費の追加・削除
  const addBulk = () => {
    if (!data) return;
    setData({ ...data, bulkExpenses: [...data.bulkExpenses, { name: "", amount: 0 }] });
  };
  const updateBulk = (i: number, field: "name" | "amount", val: string | number) => {
    if (!data) return;
    const be = [...data.bulkExpenses];
    be[i] = { ...be[i], [field]: val };
    setData({ ...data, bulkExpenses: be });
  };
  const removeBulk = (i: number) => {
    if (!data) return;
    setData({ ...data, bulkExpenses: data.bulkExpenses.filter((_, j) => j !== i) });
  };

  // P&L計算
  const calc = () => {
    if (!data) return null;
    const s = sales.totalSales;
    const costTotal = data.costCoffeeBeans + data.costMilkSyrup + data.costFoodMaterials + data.costPackaging + data.costOther;
    const expCash = data.expRent + data.expUtilities + data.expTelecom + data.expInsurance + data.expLabor + data.expSupplies + data.expAdvertising + data.expRepair + data.expOther;
    const expTotal = expCash + data.expDepreciation;
    const bulkTotal = data.bulkExpenses.reduce((sum, e) => sum + e.amount, 0);
    const grossProfit = s - costTotal;
    const operatingProfit = grossProfit - expTotal;
    const startFunds = data.carryover + data.additionalFunds;
    const endBalance = startFunds - costTotal - expCash - bulkTotal + s;
    return {
      costTotal, expCash, expTotal, bulkTotal,
      grossProfit, grossMargin: s > 0 ? grossProfit / s : 0,
      operatingProfit, operatingMargin: s > 0 ? operatingProfit / s : 0,
      costRate: s > 0 ? costTotal / s : 0,
      avgSpend: sales.orderCount > 0 ? s / sales.orderCount : 0,
      dailySales: data.operatingDays > 0 ? s / data.operatingDays : 0,
      laborRate: s > 0 ? data.expLabor / s : 0,
      startFunds, endBalance,
      cashOut: costTotal + expCash + bulkTotal,
    };
  };

  const c = calc();

  // 月選択
  const shiftMonth = (n: number) => {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(y, m - 1 + n, 1);
    setYm(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const NumInput = ({ label, value, field, suffix }: { label: string; value: number; field: string; suffix?: string }) => (
    <div style={{ marginBottom: 10 }}>
      <label>{label}</label>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <input
          type="number"
          value={value || ""}
          onChange={(e) => update(field, Number(e.target.value) || 0)}
          placeholder="0"
          style={{ textAlign: "right" }}
        />
        {suffix && <span style={{ fontSize: 12, color: "var(--muted)", flexShrink: 0 }}>{suffix}</span>}
      </div>
    </div>
  );

  const ymLabel = (() => {
    const [y, m] = ym.split("-");
    return `${y}年${parseInt(m)}月`;
  })();

  return (
    <div className="wrap">
      <header>
        <h1>📊 経営管理</h1>
        <p>売上・原価・経費・損益を一括管理</p>
      </header>
      <Nav />

      {/* 月選択 */}
      <div className="card" style={{ padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
          <button className="ghost" onClick={() => shiftMonth(-1)}>◀</button>
          <span style={{ fontWeight: 700, fontSize: 18 }}>{ymLabel}</span>
          <button className="ghost" onClick={() => shiftMonth(1)}>▶</button>
        </div>
      </div>

      {loading ? (
        <p style={{ textAlign: "center", color: "var(--muted)" }}>
          <span className="spinner" style={{ borderColor: "var(--accent)", borderTopColor: "var(--accent-weak)" }} />
          読み込み中...
        </p>
      ) : data && c && (
        <>
          {/* サマリ */}
          <div className="card total-card">
            <div className="total-label">{ymLabel} の損益</div>
            <div className="total-amount" style={{ color: c.operatingProfit >= 0 ? "#fff" : "#ffcdd2" }}>
              {fmt(c.operatingProfit)}
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 12, opacity: 0.85, flexWrap: "wrap" }}>
              <span>売上 {fmt(sales.totalSales)}</span>
              <span>原価 {fmt(c.costTotal)}</span>
              <span>経費 {fmt(c.expTotal)}</span>
              <span>口座残 {fmt(c.endBalance)}</span>
            </div>
          </div>

          {/* タブ */}
          <div className="sub-tabs">
            {([["pl","損益"],["cost","原価"],["expense","経費"],["report","推移"]] as const).map(([key, label]) => (
              <button key={key} className={`sub-tab ${tab === key ? "active" : ""}`} onClick={() => setTab(key)}>
                {label}
              </button>
            ))}
          </div>

          {/* 損益タブ */}
          {tab === "pl" && (
            <>
              <div className="card">
                <div className="cat-title">損益計算書 (P&L)</div>
                {[
                  ["売上高", sales.totalSales, false],
                  ["原価合計", c.costTotal, true],
                  ["粗利益", c.grossProfit, false],
                ].map(([label, val, neg]) => (
                  <div key={label as string} className="result-row">
                    <span>{label as string}</span>
                    <span className="mono" style={{ fontWeight: 700, color: neg ? "#c0392b" : undefined }}>
                      {fmt(val as number)}
                    </span>
                  </div>
                ))}
                <div className="result-row" style={{ fontSize: 12, color: "var(--muted)" }}>
                  <span>粗利率</span>
                  <span>{pct(c.grossMargin)}</span>
                </div>
                <div className="result-row">
                  <span>経費合計</span>
                  <span className="mono" style={{ fontWeight: 700, color: "#c0392b" }}>{fmt(c.expTotal)}</span>
                </div>
                <div className="result-row" style={{ borderTop: "2px solid var(--line)", paddingTop: 8 }}>
                  <span style={{ fontWeight: 700 }}>営業利益</span>
                  <span className="mono" style={{ fontWeight: 700, fontSize: 18, color: c.operatingProfit >= 0 ? "var(--ok)" : "#c0392b" }}>
                    {fmt(c.operatingProfit)}
                  </span>
                </div>
                <div className="result-row" style={{ fontSize: 12, color: "var(--muted)" }}>
                  <span>営業利益率</span>
                  <span>{pct(c.operatingMargin)}</span>
                </div>
              </div>

              {/* KPI */}
              <div className="card">
                <div className="cat-title">KPI</div>
                <div className="summary-grid">
                  <div className="summary-item">
                    <span className="summary-val">{pct(c.costRate)}</span>
                    <span className="summary-label">原価率</span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-val">{fmt(c.avgSpend)}</span>
                    <span className="summary-label">客単価</span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-val">{fmt(c.dailySales)}</span>
                    <span className="summary-label">日商</span>
                  </div>
                </div>
                <div className="summary-grid" style={{ marginTop: 8 }}>
                  <div className="summary-item">
                    <span className="summary-val">{sales.orderCount}</span>
                    <span className="summary-label">注文数</span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-val">{data.visitors || "-"}</span>
                    <span className="summary-label">来客数</span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-val">{pct(c.laborRate)}</span>
                    <span className="summary-label">人件費率</span>
                  </div>
                </div>
              </div>

              {/* 資金 */}
              <div className="card">
                <div className="cat-title">資金</div>
                <div className="result-row">
                  <span>期首資金</span>
                  <span className="mono" style={{ fontWeight: 700 }}>{fmt(c.startFunds)}</span>
                </div>
                <div className="result-row">
                  <span>＋ 売上</span>
                  <span className="mono" style={{ color: "var(--ok)" }}>+{fmt(sales.totalSales)}</span>
                </div>
                <div className="result-row">
                  <span>− 支出（原価+経費+一括）</span>
                  <span className="mono" style={{ color: "#c0392b" }}>-{fmt(c.cashOut)}</span>
                </div>
                <div className="result-row" style={{ borderTop: "2px solid var(--line)", paddingTop: 8 }}>
                  <span style={{ fontWeight: 700 }}>月末口座残高</span>
                  <span className="mono" style={{ fontWeight: 700, fontSize: 18 }}>{fmt(c.endBalance)}</span>
                </div>
                <div style={{ marginTop: 12 }}>
                  <NumInput label="前月繰越金" value={data.carryover} field="carryover" />
                  <NumInput label="追加資金" value={data.additionalFunds} field="additionalFunds" />
                </div>
              </div>

              {/* 売上内訳 */}
              {byProduct.length > 0 && (
                <div className="card">
                  <div className="cat-title">売上内訳 TOP10</div>
                  {byProduct.slice(0, 10).map((p, i) => (
                    <div key={p.name} className="result-row">
                      <span>
                        <span style={{ fontWeight: 700, color: "var(--accent)", marginRight: 6 }}>{i + 1}</span>
                        {p.name} <span style={{ fontSize: 11, color: "var(--muted)" }}>×{p.qty}</span>
                      </span>
                      <span className="mono" style={{ fontWeight: 700 }}>{fmt(p.amount)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* 営業日数・来客数 */}
              <div className="card">
                <div className="cat-title">営業データ</div>
                <NumInput label="営業日数" value={data.operatingDays} field="operatingDays" suffix="日" />
                <NumInput label="来客数" value={data.visitors} field="visitors" suffix="人" />
              </div>
            </>
          )}

          {/* 原価タブ */}
          {tab === "cost" && (
            <div className="card">
              <div className="cat-title">原価（売上原価）</div>
              <NumInput label="コーヒー豆・茶葉" value={data.costCoffeeBeans} field="costCoffeeBeans" />
              <NumInput label="牛乳・シロップ等" value={data.costMilkSyrup} field="costMilkSyrup" />
              <NumInput label="フード材料費" value={data.costFoodMaterials} field="costFoodMaterials" />
              <NumInput label="包装資材・消耗品" value={data.costPackaging} field="costPackaging" />
              <NumInput label="その他原価" value={data.costOther} field="costOther" />
              <div className="result-row" style={{ borderTop: "2px solid var(--line)", paddingTop: 8, marginTop: 8 }}>
                <span style={{ fontWeight: 700 }}>原価合計</span>
                <span className="mono" style={{ fontWeight: 700 }}>{fmt(c.costTotal)}</span>
              </div>
              <div className="result-row" style={{ fontSize: 12, color: "var(--muted)" }}>
                <span>原価率（売上 {fmt(sales.totalSales)} に対して）</span>
                <span>{pct(c.costRate)}</span>
              </div>
            </div>
          )}

          {/* 経費タブ */}
          {tab === "expense" && (
            <>
              <div className="card">
                <div className="cat-title">経費（販管費）</div>
                <NumInput label="家賃" value={data.expRent} field="expRent" />
                <NumInput label="水道光熱費" value={data.expUtilities} field="expUtilities" />
                <NumInput label="通信費" value={data.expTelecom} field="expTelecom" />
                <NumInput label="保険料" value={data.expInsurance} field="expInsurance" />
                <NumInput label="人件費（給与・社保）" value={data.expLabor} field="expLabor" />
                <NumInput label="消耗品費" value={data.expSupplies} field="expSupplies" />
                <NumInput label="広告宣伝費" value={data.expAdvertising} field="expAdvertising" />
                <NumInput label="修繕費" value={data.expRepair} field="expRepair" />
                <NumInput label="その他経費" value={data.expOther} field="expOther" />
                <NumInput label="減価償却費（帳簿上）" value={data.expDepreciation} field="expDepreciation" />
                <div className="result-row" style={{ borderTop: "2px solid var(--line)", paddingTop: 8, marginTop: 8 }}>
                  <span style={{ fontWeight: 700 }}>経費合計</span>
                  <span className="mono" style={{ fontWeight: 700 }}>{fmt(c.expTotal)}</span>
                </div>
              </div>

              <div className="card">
                <div className="cat-title">一括経費（設備投資等）</div>
                {data.bulkExpenses.map((be, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center" }}>
                    <input
                      placeholder="項目名"
                      value={be.name}
                      onChange={(e) => updateBulk(i, "name", e.target.value)}
                      style={{ flex: 2 }}
                    />
                    <input
                      type="number"
                      placeholder="金額"
                      value={be.amount || ""}
                      onChange={(e) => updateBulk(i, "amount", Number(e.target.value) || 0)}
                      style={{ flex: 1, textAlign: "right" }}
                    />
                    <button
                      onClick={() => removeBulk(i)}
                      style={{ width: 34, height: 34, borderRadius: 8, border: "1px solid var(--line)", background: "#fff", color: "#c0392b", fontSize: 16, flexShrink: 0 }}
                    >×</button>
                  </div>
                ))}
                <button className="ghost" onClick={addBulk} style={{ width: "100%", textAlign: "center" }}>
                  ＋ 一括経費を追加
                </button>
                {data.bulkExpenses.length > 0 && (
                  <div className="result-row" style={{ borderTop: "2px solid var(--line)", paddingTop: 8, marginTop: 8 }}>
                    <span style={{ fontWeight: 700 }}>一括経費合計</span>
                    <span className="mono" style={{ fontWeight: 700 }}>{fmt(c.bulkTotal)}</span>
                  </div>
                )}
              </div>
            </>
          )}

          {/* 推移タブ */}
          {tab === "report" && (
            <div className="card" style={{ overflowX: "auto" }}>
              <div className="cat-title">月次推移</div>
              <table className="menu-table" style={{ minWidth: 600 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>項目</th>
                    {MONTH_LABELS.map(m => <th key={m}>{m}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: "売上高", key: "_sales" },
                    { label: "原価", key: "_cost" },
                    { label: "粗利益", key: "_gross" },
                    { label: "経費", key: "_exp" },
                    { label: "営業利益", key: "_profit" },
                    { label: "口座残高", key: "_balance" },
                  ].map(row => (
                    <tr key={row.key}>
                      <td style={{ textAlign: "left", fontWeight: 600, fontSize: 12, whiteSpace: "nowrap" }}>{row.label}</td>
                      {reportData.map((rd, i) => {
                        // 簡易的にここではrdの経費のみ表示（売上はSquare APIからの取得が必要で重いため）
                        const costT = (rd.costCoffeeBeans || 0) + (rd.costMilkSyrup || 0) + (rd.costFoodMaterials || 0) + (rd.costPackaging || 0) + (rd.costOther || 0);
                        const expT = (rd.expRent || 0) + (rd.expUtilities || 0) + (rd.expTelecom || 0) + (rd.expInsurance || 0) + (rd.expLabor || 0) + (rd.expSupplies || 0) + (rd.expAdvertising || 0) + (rd.expRepair || 0) + (rd.expOther || 0) + (rd.expDepreciation || 0);
                        let val = 0;
                        if (row.key === "_cost") val = costT;
                        else if (row.key === "_exp") val = expT;
                        else if (row.key === "_gross") val = -costT; // 売上なしだと-原価
                        else if (row.key === "_profit") val = -(costT + expT);
                        else val = 0;
                        return (
                          <td key={i} className="mono" style={{
                            fontSize: 11,
                            color: val < 0 ? "#c0392b" : val > 0 ? "var(--ok)" : "var(--muted)",
                          }}>
                            {val !== 0 ? fmt(val) : "-"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="hint">※ 推移表の売上はSquare APIからリアルタイム取得のため、各月をタップして確認してください</p>
            </div>
          )}

          {/* 保存ボタン */}
          {tab !== "report" && (
            <div style={{ position: "sticky", bottom: 16 }}>
              {msg && <p className={msg.startsWith("エラー") ? "err" : "saved"} style={{ marginBottom: 8 }}>{msg}</p>}
              <button className="primary" onClick={save} disabled={saving}>
                {saving ? <><span className="spinner" />保存中...</> : "保存する"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
