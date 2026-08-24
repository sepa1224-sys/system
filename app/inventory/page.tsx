"use client";

import { useState, useEffect, useCallback } from "react";
import Nav from "@/components/Nav";

// 仕入れ表。Googleスプレッドシートをそのまま読んで、同じ並び（見出し＋列）で表示する。
// 編集はスプレッドシート側で行い、ここは閲覧と発注リンク用。

type Row = {
  name: string;
  supplier: string;
  url: string;
  price: string;
  capacity: string;
  note: string;
};
type Section = { title: string; rows: Row[] };

const yen = (v: string) => {
  const n = Number(String(v).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? `¥${n.toLocaleString()}` : v || "—";
};

export default function InventoryPage() {
  const [sections, setSections] = useState<Section[]>([]);
  const [sheetUrl, setSheetUrl] = useState("");
  const [total, setTotal] = useState(0);
  const [missingPrice, setMissingPrice] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  // Google連携が切れている状態。再接続してもらうしかない。
  const [reauth, setReauth] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    setReauth(false);
    try {
      const res = await fetch("/api/inventory/sheet");
      const d = await res.json();
      if (!res.ok) {
        if (d.needsReauth) setReauth(true);
        throw new Error(d.error || "取得失敗");
      }
      setSections(d.sections || []);
      setSheetUrl(d.sheetUrl || "");
      setTotal(d.total || 0);
      setMissingPrice(d.missingPrice || 0);
      setOpen((prev) => prev ?? (d.sections?.[0]?.title || null));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "取得失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="wrap">
      <header>
        <h1>📦 仕入れ表</h1>
        <p>スプレッドシートの内容をそのまま表示しています</p>
      </header>
      <Nav />

      {err && !reauth && <p className="err">{err}</p>}

      {reauth && (
        <div className="card" style={{ borderColor: "#e0b4b4", background: "#fdf3f3" }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            🔌 Googleとの連携が切れています
          </div>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 12px" }}>
            スプレッドシートを読むための許可の期限が切れました。
            下のボタンからGoogleにログインし直すと元に戻ります。
          </p>
          <a
            href="/api/google/authorize"
            style={{
              display: "inline-block", padding: "10px 18px", borderRadius: 8,
              background: "var(--accent)", color: "#fff", fontWeight: 700,
              fontSize: 14, textDecoration: "none",
            }}
          >
            Googleに再接続する
          </a>
        </div>
      )}

      <div className="card total-card">
        <div className="total-label">登録品目</div>
        <div className="total-amount">{total}件</div>
        <div
          style={{
            display: "flex",
            gap: 14,
            marginTop: 6,
            fontSize: 12.5,
            opacity: 0.85,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <span>📂 {sections.length}カテゴリ</span>
          {missingPrice > 0 && <span>⚠️ 価格未記入 {missingPrice}件</span>}
        </div>
      </div>

      <div
        className="card"
        style={{ padding: 14, display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}
      >
        <button onClick={load} disabled={loading}>
          {loading ? "読み込み中…" : "🔄 シートを再読み込み"}
        </button>
        {sheetUrl && (
          <a
            href={sheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: "7px 12px",
              borderRadius: 6,
              border: "1px solid var(--line, #ddd)",
              fontSize: 13,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            ✏️ シートを編集 ↗
          </a>
        )}
      </div>

      {loading && (
        <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>
          読み込み中…
        </div>
      )}

      {!loading &&
        sections.map((s) => {
          const isOpen = open === s.title;
          return (
            <div key={s.title} className="card" style={{ padding: "12px 14px" }}>
              <div
                onClick={() => setOpen(isOpen ? null : s.title)}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  cursor: "pointer",
                }}
              >
                <strong style={{ fontSize: 15 }}>{s.title}</strong>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                  {s.rows.length}件 {isOpen ? "▲" : "▼"}
                </span>
              </div>

              {isOpen && (
                <div style={{ marginTop: 10, overflowX: "auto" }}>
                  <table
                    style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 420 }}
                  >
                    <thead>
                      <tr style={{ color: "var(--muted)", fontSize: 11.5 }}>
                        <th style={{ textAlign: "left", padding: "4px 6px" }}>仕入れ物</th>
                        <th style={{ textAlign: "left", padding: "4px 6px" }}>仕入れ先</th>
                        <th style={{ textAlign: "right", padding: "4px 6px", whiteSpace: "nowrap" }}>
                          価格
                        </th>
                        <th style={{ textAlign: "right", padding: "4px 6px", whiteSpace: "nowrap" }}>
                          容量
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.rows.map((r, i) => (
                        <tr
                          key={`${r.name}-${i}`}
                          style={{ borderTop: "1px solid var(--line-soft, #eee)" }}
                        >
                          <td style={{ padding: "7px 6px" }}>
                            {r.url ? (
                              <a
                                href={r.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ fontWeight: 600 }}
                              >
                                {r.name} ↗
                              </a>
                            ) : (
                              r.name
                            )}
                            {r.note && (
                              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                                {r.note}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "7px 6px", color: "var(--muted)" }}>
                            {r.supplier || "—"}
                          </td>
                          <td
                            style={{
                              padding: "7px 6px",
                              textAlign: "right",
                              whiteSpace: "nowrap",
                              fontVariantNumeric: "tabular-nums",
                              color: r.price ? undefined : "#b5651d",
                            }}
                          >
                            {r.price ? yen(r.price) : "未記入"}
                          </td>
                          <td
                            style={{
                              padding: "7px 6px",
                              textAlign: "right",
                              whiteSpace: "nowrap",
                              fontVariantNumeric: "tabular-nums",
                              color: "var(--muted)",
                            }}
                          >
                            {r.capacity || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}

      <p className="hint" style={{ textAlign: "center", marginTop: 12 }}>
        ※ 品名をタップすると仕入先のページが開きます。<br />
        内容の編集はスプレッドシート側で行ってください。ここは読み取り専用です。
      </p>
    </div>
  );
}
