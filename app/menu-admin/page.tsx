"use client";

import { useCallback, useEffect, useState } from "react";
import Nav from "@/components/Nav";

// メニュー編集。スタッフが自分で商品と大分類を足したり消したりできる画面。
// 商品と値段はSquareに書くので、この画面で変えた内容がそのまま注文画面とレジに出る。

type Variation = { id: string; name: string; price: number | null };
type Item = {
  id: string;
  name: string;
  categoryId: string | null;
  category: string;
  variations: Variation[];
};
type Category = { id: string; name: string };
type Data = {
  categories: Category[];
  categoryOrder: string[];
  items: Item[];
  hidden: string[];
  pinSet: boolean;
  uncategorized: number;
};

const PIN_STORE = "flat:menuPin";

export default function MenuAdmin() {
  const [pin, setPin] = useState("");
  const [authed, setAuthed] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"items" | "cats">("items");
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/menu-admin");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "読み込みに失敗");
      setData(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "読み込みに失敗");
    }
  }, []);

  useEffect(() => {
    const saved = sessionStorage.getItem(PIN_STORE);
    if (saved) {
      setPin(saved);
      fetch("/api/menu-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "auth", pin: saved }),
      })
        .then((r) => r.json())
        .then((j) => {
          if (j.ok) {
            setAuthed(true);
            load();
          }
        })
        .catch(() => {});
    }
  }, [load]);

  async function unlock() {
    setErr("");
    const r = await fetch("/api/menu-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "auth", pin }),
    });
    const j = await r.json();
    if (!j.ok) return setErr("暗証番号が違います");
    sessionStorage.setItem(PIN_STORE, pin);
    setAuthed(true);
    load();
  }

  // すべての変更はここを通す。暗証番号を必ず添える
  async function send(body: Record<string, unknown>, okMsg: string) {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const r = await fetch("/api/menu-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, pin }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.items ? `${j.error}\n（${j.items.join("・")}）` : j.error);
      setMsg(okMsg);
      await load();
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "失敗しました");
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!authed) {
    return (
      <main className="wrap">
        <Nav />
        <div className="card" style={{ maxWidth: 360, margin: "40px auto", textAlign: "center" }}>
          <h2 style={{ fontSize: 18, marginBottom: 6 }}>🍽️ メニュー編集</h2>
          <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
            値段を変えられる画面です。暗証番号を入れてください。
          </p>
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && unlock()}
            placeholder="4〜8桁"
            style={{ textAlign: "center", fontSize: 20, letterSpacing: 6 }}
          />
          <button className="primary" style={{ marginTop: 12, width: "100%" }} onClick={unlock}>
            開く
          </button>
          {err && <p className="err">{err}</p>}
          <p style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 14 }}>
            まだ決めていないときは、何も入れずに「開く」を押すと設定できます。
          </p>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="wrap">
        <Nav />
        <p style={{ textAlign: "center", padding: 40 }}>読み込み中…</p>
      </main>
    );
  }

  const catNames = data.categoryOrder;
  const shown = data.items.filter(
    (i) => !filter || i.name.includes(filter) || i.category.includes(filter),
  );
  const byCat: Record<string, Item[]> = {};
  for (const i of shown) (byCat[i.category || "（未分類）"] ??= []).push(i);
  const listOrder = [...catNames.filter((c) => byCat[c]), ...Object.keys(byCat).filter((c) => !catNames.includes(c))];

  return (
    <main className="wrap">
      <Nav />
      <h2 style={{ fontSize: 18, margin: "4px 0 2px" }}>🍽️ メニュー編集</h2>
      <p style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 12 }}>
        ここで変えた内容は、注文画面とSquareのレジにそのまま出ます。
      </p>

      {!data.pinSet && (
        <PinSetup
          onSet={async (p) => {
            if (await send({ action: "pin.set", newPin: p }, "暗証番号を決めました")) {
              setPin(p);
              sessionStorage.setItem(PIN_STORE, p);
            }
          }}
        />
      )}
      {data.uncategorized > 0 && (
        <p className="hint">
          ⚠️ 大分類が付いていない商品が {data.uncategorized} 品あります。注文画面では「その他」にまとまります。
        </p>
      )}
      {err && <p className="err" style={{ whiteSpace: "pre-wrap" }}>{err}</p>}
      {msg && <p className="hint">✅ {msg}</p>}

      <div className="kind-toggle" style={{ marginBottom: 12 }}>
        <button className={`kind-btn ${tab === "items" ? "active" : ""}`} onClick={() => setTab("items")}>
          商品
        </button>
        <button className={`kind-btn ${tab === "cats" ? "active" : ""}`} onClick={() => setTab("cats")}>
          大分類
        </button>
      </div>

      {tab === "items" && (
        <>
          <NewItem cats={data.categories} busy={busy} onCreate={(n, p, c) =>
            send({ action: "item.create", name: n, price: p, categoryId: c }, `「${n}」を追加しました`)} />
          <input
            placeholder="商品名で絞り込む"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ marginBottom: 10 }}
          />
          {listOrder.map((cat) => (
            <div className="card" key={cat}>
              <div className="cat-title">{cat}（{byCat[cat].length}）</div>
              {byCat[cat].map((it) => (
                <ItemRow
                  key={it.id}
                  item={it}
                  cats={data.categories}
                  hidden={data.hidden.includes(it.id)}
                  busy={busy}
                  send={send}
                />
              ))}
            </div>
          ))}
        </>
      )}

      {tab === "cats" && (
        <CategoryTab data={data} busy={busy} send={send} />
      )}
    </main>
  );
}

function PinSetup({ onSet }: { onSet: (pin: string) => void | Promise<void> }) {
  const [p, setP] = useState("");
  return (
    <div className="card" style={{ borderColor: "var(--accent)" }}>
      <strong style={{ fontSize: 14 }}>最初に暗証番号を決めてください</strong>
      <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "4px 0 8px" }}>
        決めるまでは誰でもこの画面を開けます。4〜8桁の数字。
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={p} onChange={(e) => setP(e.target.value)} inputMode="numeric" placeholder="例: 7770" />
        <button className="primary" onClick={() => onSet(p)}>決める</button>
      </div>
    </div>
  );
}

function NewItem({
  cats,
  busy,
  onCreate,
}: {
  cats: Category[];
  busy: boolean;
  onCreate: (name: string, price: number, categoryId: string | null) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [cat, setCat] = useState("");

  if (!open) {
    return (
      <button className="primary" style={{ width: "100%", marginBottom: 12 }} onClick={() => setOpen(true)}>
        ＋ 新しい商品を追加
      </button>
    );
  }
  return (
    <div className="card" style={{ borderColor: "var(--accent)" }}>
      <strong style={{ fontSize: 14 }}>新しい商品</strong>
      <label>商品名</label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 季節のクリームソーダ" />
      <label>値段（税込）</label>
      <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric" placeholder="例: 650" />
      <label>大分類</label>
      <select value={cat} onChange={(e) => setCat(e.target.value)}>
        <option value="">（未分類）</option>
        {cats.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button
          className="primary"
          style={{ flex: 2 }}
          disabled={busy}
          onClick={async () => {
            const p = Number(price);
            if (!name.trim() || !Number.isFinite(p)) return;
            if (await onCreate(name.trim(), p, cat || null)) {
              setName(""); setPrice(""); setOpen(false);
            }
          }}
        >
          追加する
        </button>
        <button className="ghost" style={{ flex: 1 }} onClick={() => setOpen(false)}>やめる</button>
      </div>
    </div>
  );
}

function ItemRow({
  item,
  cats,
  hidden,
  busy,
  send,
}: {
  item: Item;
  cats: Category[];
  hidden: boolean;
  busy: boolean;
  send: (b: Record<string, unknown>, m: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(item.name);
  const [cat, setCat] = useState(item.categoryId ?? "");
  const [prices, setPrices] = useState<Record<string, string>>(
    Object.fromEntries(item.variations.map((v) => [v.id, String(v.price ?? "")])),
  );

  const priceLabel = item.variations
    .map((v) => (v.name === "Regular" ? `¥${v.price ?? "―"}` : `${v.name} ¥${v.price ?? "―"}`))
    .join(" / ");

  return (
    <div style={{ borderTop: "1px solid var(--line)", padding: "8px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, opacity: hidden ? 0.45 : 1 }}>
            {item.name}
            {hidden && <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 6 }}>提供停止中</span>}
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>{priceLabel}</div>
        </div>
        <button className="ghost" style={{ fontSize: 12 }} disabled={busy}
          onClick={() => send({ action: "item.hidden", id: item.id, hidden: !hidden },
            hidden ? `「${item.name}」を出しました` : `「${item.name}」を止めました`)}>
          {hidden ? "出す" : "止める"}
        </button>
        <button className="ghost" style={{ fontSize: 12 }} onClick={() => setOpen(!open)}>
          {open ? "閉じる" : "編集"}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 8, paddingLeft: 4 }}>
          <label>商品名</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
          <label>大分類</label>
          <select value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">（未分類）</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button className="primary" style={{ width: "100%", marginTop: 8 }} disabled={busy}
            onClick={() => send({ action: "item.update", id: item.id, name, categoryId: cat || null },
              `「${name}」を変更しました`)}>
            名前と分類を保存
          </button>

          <label style={{ marginTop: 12 }}>値段</label>
          {item.variations.map((v) => (
            <div key={v.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 12.5, width: 90 }}>{v.name === "Regular" ? "値段" : v.name}</span>
              <input
                value={prices[v.id] ?? ""}
                inputMode="numeric"
                onChange={(e) => setPrices({ ...prices, [v.id]: e.target.value })}
                style={{ flex: 1 }}
              />
              <button className="ghost" style={{ fontSize: 12 }} disabled={busy}
                onClick={() => {
                  const p = Number(prices[v.id]);
                  if (!Number.isFinite(p)) return;
                  send({ action: "item.price", variationId: v.id, price: p },
                    `「${item.name}」を¥${p.toLocaleString()}にしました`);
                }}>
                保存
              </button>
            </div>
          ))}

          <button className="ghost" style={{ width: "100%", marginTop: 10, color: "#c0392b" }} disabled={busy}
            onClick={() => {
              if (!confirm(`「${item.name}」をSquareから削除します。\n売上レポートには残りますが、元には戻せません。\n\n期間限定メニューを一時的に外すだけなら「止める」を使ってください。`)) return;
              send({ action: "item.delete", id: item.id }, `「${item.name}」を削除しました`);
            }}>
            この商品を削除する
          </button>
        </div>
      )}
    </div>
  );
}

function CategoryTab({
  data,
  busy,
  send,
}: {
  data: Data;
  busy: boolean;
  send: (b: Record<string, unknown>, m: string) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const order = data.categoryOrder;
  const idOf = (n: string) => data.categories.find((c) => c.name === n)?.id ?? "";
  const countOf = (n: string) => data.items.filter((i) => i.category === n).length;

  function move(i: number, d: -1 | 1) {
    const next = [...order];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    send({ action: "category.reorder", names: next }, "並び順を変えました");
  }

  return (
    <>
      <div className="card" style={{ borderColor: "var(--accent)" }}>
        <strong style={{ fontSize: 14 }}>大分類を追加</strong>
        <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "4px 0 8px" }}>
          先頭に絵文字を付けると注文画面で見分けやすくなります（例: 🍺 ビール）
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 🍺 ビール" />
          <button className="primary" disabled={busy}
            onClick={async () => {
              if (!name.trim()) return;
              if (await send({ action: "category.create", name: name.trim() }, `「${name.trim()}」を作りました`)) setName("");
            }}>
            追加
          </button>
        </div>
      </div>

      <div className="card">
        <div className="cat-title">注文画面での並び順</div>
        {order.length === 0 && <p style={{ fontSize: 13, color: "var(--muted)" }}>まだ大分類がありません。</p>}
        {order.map((n, i) => (
          <CategoryRow
            key={n}
            name={n}
            id={idOf(n)}
            count={countOf(n)}
            first={i === 0}
            last={i === order.length - 1}
            busy={busy}
            onMove={(d) => move(i, d)}
            send={send}
          />
        ))}
      </div>
    </>
  );
}

function CategoryRow({
  name, id, count, first, last, busy, onMove, send,
}: {
  name: string; id: string; count: number; first: boolean; last: boolean; busy: boolean;
  onMove: (d: -1 | 1) => void;
  send: (b: Record<string, unknown>, m: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(name);
  return (
    <div style={{ borderTop: "1px solid var(--line)", padding: "8px 0", display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <button className="ghost" style={{ fontSize: 10, padding: "1px 6px" }} disabled={busy || first} onClick={() => onMove(-1)}>▲</button>
        <button className="ghost" style={{ fontSize: 10, padding: "1px 6px" }} disabled={busy || last} onClick={() => onMove(1)}>▼</button>
      </div>
      {editing ? (
        <input value={v} onChange={(e) => setV(e.target.value)} style={{ flex: 1 }} />
      ) : (
        <div style={{ flex: 1, fontSize: 14 }}>
          {name} <span style={{ fontSize: 12, color: "var(--muted)" }}>（{count}品）</span>
        </div>
      )}
      {editing ? (
        <button className="ghost" style={{ fontSize: 12 }} disabled={busy}
          onClick={async () => {
            if (await send({ action: "category.rename", id, name: v }, "名前を変えました")) setEditing(false);
          }}>保存</button>
      ) : (
        <button className="ghost" style={{ fontSize: 12 }} onClick={() => setEditing(true)}>名前</button>
      )}
      <button className="ghost" style={{ fontSize: 12, color: "#c0392b" }} disabled={busy}
        onClick={() => {
          if (count > 0) return alert(`「${name}」には${count}品が入っています。先に別の分類へ移してください。`);
          if (!confirm(`「${name}」を削除します。よろしいですか？`)) return;
          send({ action: "category.delete", id }, `「${name}」を削除しました`);
        }}>削除</button>
    </div>
  );
}
