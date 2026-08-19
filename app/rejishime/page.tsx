"use client";

import Nav from "@/components/Nav";

// レジ締めの手順書。レジ締めをする人全員に共有する。
// ブラウザの印刷（⌘P / 共有→プリント）からPDFにできるよう、印刷用のCSSを入れてある。

const FLOAT = 30000;

export default function RejishimePage() {
  return (
    <div className="wrap rj">
      <div className="no-print">
        <header>
          <h1>🧾 レジ締めのやり方</h1>
          <p>はじめての人向け・この通りに進めれば終わります</p>
        </header>
        <Nav />
        <div className="card" style={{ padding: 14, textAlign: "center" }}>
          <button className="primary" onClick={() => window.print()}>
            🖨 印刷 / PDFで保存
          </button>
          <p className="hint" style={{ marginTop: 6 }}>
            スマホは「共有 → プリント」からPDFにできます
          </p>
        </div>
      </div>

      <div className="print-only rj-title">
        <h1>レジ締めのやり方</h1>
        <p>flat. ／ この通りに進めれば終わります</p>
      </div>

      <div className="card rj-box">
        <h2>はじめに覚えること</h2>
        <ul>
          <li>
            ドロワーには<b>いつも釣銭を ¥{FLOAT.toLocaleString()} 入れておく</b>。
            これは売上ではないので、締めのときも残したまま。
          </li>
          <li>
            現金売上の金額は<b>Squareから自動で入る</b>ので、自分で計算しない。
          </li>
          <li>
            <b>ぴったり合わなくても大丈夫。</b>差が出た理由をメモに書けばよい。
            隠したり、つじつまを合わせたりしない。
          </li>
        </ul>
      </div>

      <div className="card rj-box">
        <h2>手順</h2>

        <div className="rj-step">
          <span className="rj-num">1</span>
          <div>
            <b>システムの「📈 売上」を開く</b>
            <p>flat-keihi.vercel.app → 上のメニューから「📈 売上」</p>
          </div>
        </div>

        <div className="rj-step">
          <span className="rj-num">2</span>
          <div>
            <b>日付が today になっているか見る</b>
            <p>
              日をまたいで作業しているときは要注意。
              <b>売上が立った日</b>を選ぶ（深夜1時の締めなら前日）。
            </p>
          </div>
        </div>

        <div className="rj-step">
          <span className="rj-num">3</span>
          <div>
            <b>「レジ締め」タブを押す</b>
            <p>概要／レジ締め／商品別／時間帯／明細 のうち2つ目。</p>
          </div>
        </div>

        <div className="rj-step">
          <span className="rj-num">4</span>
          <div>
            <b>釣銭準備金が ¥{FLOAT.toLocaleString()} になっているか確認</b>
            <p>違っていたら直す。基本は変わらない。</p>
          </div>
        </div>

        <div className="rj-step">
          <span className="rj-num">5</span>
          <div>
            <b>レジから現金を払ったなら、その金額を入れる</b>
            <p>
              買い出しなどでドロワーから出した分。
              <b>無ければ 0 のまま</b>。レシートは必ず取っておく。
            </p>
          </div>
        </div>

        <div className="rj-step">
          <span className="rj-num">6</span>
          <div>
            <b>「あるべき金額」が出るので、数える前に見ておく</b>
            <p>釣銭準備金 ＋ 現金売上 − 現金支出 で自動計算される。</p>
          </div>
        </div>

        <div className="rj-step">
          <span className="rj-num">7</span>
          <div>
            <b>ドロワーの現金を数える</b>
            <p>
              札と硬貨を種類ごとに分けて数えると間違えにくい。
              <b>2回数えて同じ数になったら確定</b>。
            </p>
          </div>
        </div>

        <div className="rj-step">
          <span className="rj-num">8</span>
          <div>
            <b>「実際に数えた金額」に入れる</b>
            <p>釣銭の¥{FLOAT.toLocaleString()}も含めた、ドロワーの中の全額。</p>
          </div>
        </div>

        <div className="rj-step">
          <span className="rj-num">9</span>
          <div>
            <b>差が出たらメモに理由を書く</b>
            <p>
              例:「チップ¥500」「カード会計を現金で受け取ってしまった」
              「原因不明」でもよい。<b>空欄のままにしない。</b>
            </p>
          </div>
        </div>

        <div className="rj-step">
          <span className="rj-num">10</span>
          <div>
            <b>「レジを締める」を押す</b>
            <p>押したあとに直したくなったら、同じ画面で締め直せる。</p>
          </div>
        </div>
      </div>

      <div className="card rj-box">
        <h2>差が出たときによくある原因</h2>
        <table className="rj-table">
          <tbody>
            <tr>
              <td>多い</td>
              <td>
                チップをもらった ／ カード・PayPayのお客さんから現金を受け取った ／
                お釣りを渡し忘れた
              </td>
            </tr>
            <tr>
              <td>少ない</td>
              <td>
                お釣りを多く渡した ／ レジを通さずに現金を受け取った ／
                ドロワーから払った分を入力し忘れた
              </td>
            </tr>
          </tbody>
        </table>
        <p className="rj-note">
          <b>チップは売上ではありません。</b>メモに「チップ」と書いておけば、
          あとで雑収入として処理します。
        </p>
      </div>

      <div className="card rj-box">
        <h2>やってはいけないこと</h2>
        <ul>
          <li>差を埋めるために、数えた金額を書き換える</li>
          <li>レジを通さずに現金で受け取る（売上が記録に残りません）</li>
          <li>ドロワーから現金を出したのに、入力しない</li>
        </ul>
      </div>

      <div className="card rj-box">
        <h2>困ったら</h2>
        <p>
          分からないまま締めずに、坂本さんに連絡してください。
          締めは<b>あとから直せます</b>。
        </p>
      </div>

      <style jsx global>{`
        .rj h2 {
          font-size: 15px;
          margin: 0 0 10px;
        }
        .rj-box {
          padding: 14px 16px;
        }
        .rj-box ul {
          margin: 0;
          padding-left: 18px;
          font-size: 13.5px;
          line-height: 1.9;
        }
        .rj-step {
          display: flex;
          gap: 10px;
          padding: 9px 0;
          border-top: 1px solid var(--line-soft, #eee);
        }
        .rj-step:first-of-type {
          border-top: none;
        }
        .rj-num {
          flex: 0 0 24px;
          height: 24px;
          border-radius: 12px;
          background: var(--accent);
          color: #fff;
          font-size: 12px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .rj-step b {
          font-size: 14px;
        }
        .rj-step p {
          margin: 3px 0 0;
          font-size: 12.5px;
          color: var(--muted);
          line-height: 1.7;
        }
        .rj-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        .rj-table td {
          padding: 7px 6px;
          border-top: 1px solid var(--line-soft, #eee);
          vertical-align: top;
        }
        .rj-table td:first-child {
          width: 56px;
          font-weight: 700;
          white-space: nowrap;
        }
        .rj-note {
          font-size: 12.5px;
          color: var(--muted);
          margin: 8px 0 0;
        }
        .print-only {
          display: none;
        }
        @media print {
          .no-print {
            display: none !important;
          }
          .print-only {
            display: block;
          }
          .rj-title h1 {
            font-size: 20px;
            margin: 0 0 2px;
          }
          .rj-title p {
            font-size: 12px;
            color: #666;
            margin: 0 0 12px;
          }
          .card {
            box-shadow: none;
            border: 1px solid #ddd;
            break-inside: avoid;
            page-break-inside: avoid;
          }
          body {
            background: #fff;
          }
        }
      `}</style>
    </div>
  );
}
