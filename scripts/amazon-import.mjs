#!/usr/bin/env node
/**
 * Amazon Business 注文履歴CSV → freee仕訳用CSV変換スクリプト
 *
 * Usage: node amazon-import.mjs [input.csv] [output.csv]
 *   defaults:
 *     input  = ~/Downloads/注文履歴_from_*.csv  (latest)
 *     output = ~/Downloads/amazon_仕訳済み.csv
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ── Config ──────────────────────────────────────────────────────────────────

const EXCLUDE_ASINS = new Set(['B08NX949GP']); // LANケーブル（個人）

const CARD_MAP = {
  '4939': { label: '坂本立替', counterAccount: '役員借入金' },
  '4137': { label: '会社カード', counterAccount: '普通預金（GMOあおぞらネット銀行）' },
};

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Parse a CSV line handling quoted fields (with commas inside) */
function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

/** Clean ="value" format from Amazon CSV */
function cleanValue(v) {
  if (typeof v !== 'string') return v;
  const m = v.match(/^="?(.*?)"?$/);
  if (m) return m[1];
  return v.trim();
}

/** Parse numeric, stripping quotes */
function num(v) {
  const s = cleanValue(v).replace(/,/g, '');
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

// ── Category classification ─────────────────────────────────────────────────

function classify(productName, amazonCategory, subtotalInclTax) {
  const pn = productName.toLowerCase();
  const cat = (amazonCategory || '').toLowerCase();

  // ── Plumbing / construction (check early - specific items) ──
  if (pn.includes('手洗いボウル') || pn.includes('洗面ボウル')) return '建物附属設備';
  if (pn.includes('温水器') || pn.includes('湯ぽっと')) return '建物附属設備';

  // ── Kitchen equipment / tools (check BEFORE food to avoid false matches) ──
  const kitchenToolKeywords = ['コーヒースケール', 'タンパー', 'ミルクピッチャー',
    'ノックボックス', 'エスプレッソショットグラス', '計量カップ', '一押くん',
    'ミルクジャグ', 'ショットグラス'];
  for (const kw of kitchenToolKeywords) {
    if (pn.includes(kw.toLowerCase())) return '消耗品費';
  }

  // Cleaning supplies
  if (pn.includes('クリーナー') || pn.includes('洗浄') || pn.includes('クリーニング')) {
    return '消耗品費';
  }

  // ── Furniture / fixtures (check BEFORE food to avoid コーヒー台 false match) ──
  const furnitureKeywords = ['テーブル', 'スチールラック', 'ペーパーホルダー', '紙巻器'];
  for (const kw of furnitureKeywords) {
    if (pn.includes(kw.toLowerCase())) {
      return subtotalInclTax >= 100000 ? '備品' : '消耗品費';
    }
  }

  // ── Lighting (check BEFORE food) ──
  const lightingKeywords = ['照明', 'ライト', 'ランプ', 'ペンダントライト',
    'スポットライト', 'ブラケットライト'];
  for (const kw of lightingKeywords) {
    if (pn.includes(kw.toLowerCase())) {
      return subtotalInclTax >= 100000 ? '備品' : '消耗品費';
    }
  }
  if (cat.includes('lighting')) {
    return subtotalInclTax >= 100000 ? '備品' : '消耗品費';
  }

  // ── Alcohol / liquor ──
  const alcoholKeywords = ['ジン', 'ウォッカ', 'テキーラ', 'アペロール', '梅酒',
    'リキュール', 'ウイスキー', 'バーボン', 'キュラソー', 'コアントロー'];
  for (const kw of alcoholKeywords) {
    if (pn.includes(kw.toLowerCase())) return '仕入高';
  }
  if (cat.includes('wine') || cat.includes('alcoholic beverage')) return '仕入高';

  // ── Food / drink ingredients ──
  const foodKeywords = ['シロップ', 'ジュース', 'コーラ', '炭酸水', 'ライム',
    'コーヒー', 'ガムシロップ', '梅', '飲料'];
  for (const kw of foodKeywords) {
    if (pn.includes(kw.toLowerCase())) return '仕入高';
  }
  if (cat === 'grocery' || cat.includes('grocery')) {
    return '仕入高';
  }

  // Default
  return '消耗品費';
}

// ── Main ────────────────────────────────────────────────────────────────────

function main() {
  const home = os.homedir();

  // Resolve input file
  let inputFile = process.argv[2];
  if (!inputFile) {
    // Find latest Amazon CSV in Downloads
    const dlDir = path.join(home, 'Downloads');
    const candidates = fs.readdirSync(dlDir)
      .filter(f => f.startsWith('注文履歴') && f.endsWith('.csv'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(dlDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    if (candidates.length === 0) {
      console.error('Error: No 注文履歴 CSV found in ~/Downloads');
      process.exit(1);
    }
    inputFile = path.join(dlDir, candidates[0].name);
  }

  const outputFile = process.argv[3] ||
    path.join(home, 'Downloads', 'amazon_仕訳済み.csv');

  console.log(`Input:  ${inputFile}`);
  console.log(`Output: ${outputFile}`);
  console.log('');

  // Read & parse CSV
  const raw = fs.readFileSync(inputFile, 'utf-8');
  const lines = raw.split(/\r?\n/).filter(l => l.trim());
  const headers = parseCSVLine(lines[0]);

  // Build column index
  const col = {};
  headers.forEach((h, i) => { col[h.trim()] = i; });

  // Parse rows
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    if (fields.length < 10) continue;

    const asin = cleanValue(fields[col['ASIN']] || '');
    if (EXCLUDE_ASINS.has(asin)) continue;

    const orderDate = cleanValue(fields[col['注文日']] || '');
    const orderNumber = cleanValue(fields[col['注文番号']] || '');
    const productName = cleanValue(fields[col['商品名']] || '');
    const amazonCategory = cleanValue(fields[col['商品カテゴリー']] || '');
    const quantity = num(fields[col['商品の数量']]);
    const subtotalInclTax = num(fields[col['商品の小計（税込）']]);
    const subtotalExclTax = num(fields[col['商品の小計（税抜）']]);
    const taxAmount = num(fields[col['商品の小計（消費税）']]);
    const taxRate = cleanValue(fields[col['商品の小計（税率）']] || '');
    const shippingInclTax = num(fields[col['商品の配送料および手数料（税込）']]);
    const paymentDate = cleanValue(fields[col['支払い確定日']] || '');
    const paymentAmount = num(fields[col['支払い金額']]);
    const cardLast4 = cleanValue(fields[col['クレジットカード番号（下4桁）']] || '');
    const seller = cleanValue(fields[col['出品者名']] || '');
    const invoiceNumber = cleanValue(fields[col['適格請求書発行事業者登録番号']] || '');

    const card = CARD_MAP[cardLast4] || { label: `不明(${cardLast4})`, counterAccount: '不明' };
    const account = classify(productName, amazonCategory, subtotalInclTax);

    rows.push({
      paymentDate: paymentDate || '未確定',
      paymentAmount,
      orderDate,
      orderNumber,
      productName,
      quantity,
      subtotalExclTax,
      taxAmount,
      subtotalInclTax,
      taxRate,
      shippingInclTax,
      account,
      cardLabel: card.label,
      counterAccount: card.counterAccount,
      seller,
      invoiceNumber: invoiceNumber || '',
      remark: '',
      // For grouping
      _paymentKey: `${paymentDate || '未確定'}|${paymentAmount}`,
    });
  }

  // ── Group by payment ──────────────────────────────────────────────────────
  const paymentGroups = new Map();
  for (const row of rows) {
    const key = row._paymentKey;
    if (!paymentGroups.has(key)) {
      paymentGroups.set(key, {
        paymentDate: row.paymentDate,
        paymentAmount: row.paymentAmount,
        cardLabel: row.cardLabel,
        counterAccount: row.counterAccount,
        items: [],
      });
    }
    paymentGroups.get(key).items.push(row);
  }

  // ── Output CSV ────────────────────────────────────────────────────────────
  const csvHeaders = [
    '支払日', '銀行引落金額', '注文日', '注文番号', '商品名', '数量',
    '税抜金額', '消費税', '税込金額', '税率', '配送料（税込）',
    '勘定科目', '立替区分', '相手勘定', '出品者名', 'インボイス番号', '備考',
  ];

  const csvLines = [csvHeaders.join(',')];

  // Sort rows by payment date, then order date
  const sortedRows = [...rows].sort((a, b) => {
    if (a.paymentDate !== b.paymentDate) return a.paymentDate.localeCompare(b.paymentDate);
    return a.orderDate.localeCompare(b.orderDate);
  });

  for (const row of sortedRows) {
    const line = [
      row.paymentDate,
      row.paymentAmount,
      row.orderDate,
      row.orderNumber,
      `"${row.productName.replace(/"/g, '""')}"`,
      row.quantity,
      row.subtotalExclTax,
      row.taxAmount,
      row.subtotalInclTax,
      row.taxRate,
      row.shippingInclTax,
      row.account,
      row.cardLabel,
      row.counterAccount,
      `"${row.seller.replace(/"/g, '""')}"`,
      row.invoiceNumber,
      row.remark,
    ];
    csvLines.push(line.join(','));
  }

  // Write with BOM for Excel
  const BOM = '\uFEFF';
  fs.writeFileSync(outputFile, BOM + csvLines.join('\n'), 'utf-8');
  console.log(`✓ 出力完了: ${outputFile}`);
  console.log(`  ${sortedRows.length} 件（除外後）`);
  console.log('');

  // ── Human-readable summary ────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  支払グループ別サマリー（銀行照合用）');
  console.log('═══════════════════════════════════════════════════════════════');

  const sortedGroups = [...paymentGroups.entries()].sort((a, b) =>
    a[1].paymentDate.localeCompare(b[1].paymentDate));

  let totalAll = 0;
  let totalSakamoto = 0;
  let totalCompany = 0;

  for (const [, group] of sortedGroups) {
    const amt = group.paymentAmount;
    totalAll += amt;
    if (group.cardLabel === '坂本立替') totalSakamoto += amt;
    else totalCompany += amt;

    console.log('');
    console.log(`┌─ ${group.paymentDate}  ¥${amt.toLocaleString()}  [${group.cardLabel}]`);
    console.log(`│  相手勘定: ${group.counterAccount}`);

    // Summarize by account
    const accountSummary = {};
    for (const item of group.items) {
      if (!accountSummary[item.account]) accountSummary[item.account] = 0;
      accountSummary[item.account] += item.subtotalInclTax + item.shippingInclTax;
    }

    for (const item of group.items) {
      const shipping = item.shippingInclTax > 0 ? ` +送料¥${item.shippingInclTax}` : '';
      console.log(`│  [${item.account}] ${item.productName.substring(0, 40)}...`);
      console.log(`│           ¥${item.subtotalInclTax.toLocaleString()} x${item.quantity}${shipping}`);
    }

    console.log('│');
    console.log(`│  勘定科目内訳:`);
    for (const [acct, total] of Object.entries(accountSummary)) {
      console.log(`│    ${acct}: ¥${total.toLocaleString()}`);
    }
    console.log('└──');
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  合計');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  全体:       ¥${totalAll.toLocaleString()}`);
  console.log(`  会社カード: ¥${totalCompany.toLocaleString()}`);
  console.log(`  坂本立替:   ¥${totalSakamoto.toLocaleString()}`);
  console.log('');

  // Account summary across all items
  const globalAccountSummary = {};
  for (const row of rows) {
    const key = row.account;
    if (!globalAccountSummary[key]) globalAccountSummary[key] = { count: 0, total: 0 };
    globalAccountSummary[key].count++;
    globalAccountSummary[key].total += row.subtotalInclTax + row.shippingInclTax;
  }

  console.log('  勘定科目別集計:');
  for (const [acct, data] of Object.entries(globalAccountSummary).sort((a, b) => b[1].total - a[1].total)) {
    console.log(`    ${acct}: ${data.count}件  ¥${data.total.toLocaleString()}`);
  }
  console.log('');

  // Warn about items without payment date
  const noPay = rows.filter(r => r.paymentDate === '未確定');
  if (noPay.length > 0) {
    console.log('⚠  支払未確定の商品:');
    for (const r of noPay) {
      console.log(`   ${r.orderDate} ${r.productName.substring(0, 50)}`);
    }
    console.log('');
  }
}

main();
