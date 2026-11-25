# Threads 自動投稿 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** 前日に下書きを作り、営業日に1日1回 Threads に自動投稿する。
**Architecture:** 計算は `lib/threadsPlan.ts`（純粋）、保存・AI・APIは `lib/threads.ts`、cronは5分おき。
**Tech Stack:** Next.js 15、Vercel KV、@anthropic-ai/sdk、Threads API
**Spec:** `docs/superpowers/specs/2026-11-25-threads-auto-post-design.md`（2026-11-25 坂本さん承認「作って」）

## Global Constraints
- 自動投稿は初期オフ。告知も初期すべてオフ。予定表の place・note を AI に渡さない
- 夜は「24時まで（ラストオーダー23:30）」。500字まで。電話番号・メールは出さない
- 別の作業が `package.json` を触っているので、このファイルは変えない。テストは `node --test lib/threadsPlan.test.ts`

## Review Focus
- 木曜に中止のランへ誘う → 木曜は「ランの紹介」を出さない
- 日付が変わったイベント → 印の日付と違えば告知しない
- 公開の呼び出しが時間切れ → やり直さず「確認してください」
- 全角の電話番号 → 検査で止まる
- 画面で直している間に投稿時刻が来る → ロック後は直せない

### Task 1: 計算とテスト
`lib/threadsPlan.ts`: `threadsLength` `checkText` `hasContact` `publicEvents` `pickTheme` `draftStale` `nextPostDate`。テスト `lib/threadsPlan.test.ts`。
### Task 2: 保存・AI・Threads
`lib/threads.ts`: `getSettings` `saveSettings` `getDraft` `makeDraft` `connectThreads` `tick` `listRuns`。
### Task 3: API・cron・OAuth
`app/api/threads/{route,authorize/route,callback/route}.ts`、`app/api/cron/threads/route.ts`、`middleware.ts`（callback だけ公開）、`vercel.json`。
### Task 4: 画面
`app/threads/page.tsx`、`lib/nav.ts`、`docs/operations/Threads自動投稿.md`。
### Task 5: 見直し・ビルド・本番確認
別の目でのレビュー → build → main → /threads で下書きを1つ作って確かめる（投稿はしない）。
