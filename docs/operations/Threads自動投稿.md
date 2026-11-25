# Threadsの自動投稿（/threads）

2026-11-25 作成。設計は `docs/superpowers/specs/2026-11-25-threads-auto-post-design.md`。

## 動き
- 営業日に1日1回（初期19:00）。前日22時にAIが下書きを作り、何もしなければ出る。火曜・臨時休業（/instagram と共通）・「出さない日」は出ない
- 「告知する」にしたイベントだけ、前日と3日前に告知する。予定表の場所・メモ（お客様の連絡先や金額が入る）はAIに渡さない
- 木曜のランは「毎週告知する」をオンにすると、予定表にある週だけ前日の水曜に出る
- 出したかどうか分からない失敗（時間切れなど）は、2回出さないためやり直さない。履歴に「確認してください」と出る
- 自動投稿は初期オフ。オフでも下書きは作られる

## つなぐ手順（最初に1回・本人）
1. developers.facebook.com の flat-auto-video に「Threads API」の用途を足す。権限は threads_basic と threads_content_publish
2. コールバックURLに `https://flat-keihi.vercel.app/api/threads/callback` を入れる
3. App roles で flat.hikone を Threads Tester にし、Threads側（設定 → ウェブサイトのアクセス許可）で承認する
4. ThreadsのアプリIDとシークレット（親アプリのIDとは別）を、Vercel の flat-keihi に `THREADS_APP_ID`・`THREADS_APP_SECRET` として入れて、デプロイし直す。チャットには貼らない
5. /threads の「Threadsにつなぐ」を押し、表示された @ が flat.hikone か確かめる
6. 下書きを2〜3日見てから、自動投稿をオンにする

## 仕組みのメモ
- KV：`th:settings` `th:events`（告知の印）`th:draft:<日付>` `th:lock:<日付>`（1日1回の鍵）`th:runs` `th:conn`
- トークンは60日。7日ごとに自動で延ばす。切れたら画面でつなぎ直す
- 計算は `lib/threadsPlan.ts`（テストは `node --test lib/threadsPlan.test.ts`）、保存とAPIは `lib/threads.ts`
