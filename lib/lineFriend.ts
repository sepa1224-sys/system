// 公式アカウントを友だち追加しているかの判定。
//
// liff.getFriendship() はチャネルのリンク状況や実行環境によって動かないことがあるので、
// Messaging APIのプロフィール取得で確実に見る（友だちでない／ブロック中なら404）。
// LIFFのuserIdとMessaging APIのuserIdは、同じプロバイダー内なら一致する。

/** 友だち追加のリンク。LINEアプリで公式アカウントが開く */
export const LINE_ADD_URL = "https://line.me/R/ti/p/@391wpozk";

/**
 * true=友だち / false=未追加かブロック中 / null=判定できない（トークン未設定・API不調）
 * null のときは呼び出し側で通す。判定できないことを理由に申込を止めない。
 */
export async function isLineFriend(userId: string): Promise<boolean | null> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
  if (!token || !userId) return null;
  try {
    const res = await fetch(
      `https://api.line.me/v2/bot/profile/${encodeURIComponent(userId)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (res.ok) return true;
    if (res.status === 404) return false;
    return null;
  } catch {
    return null;
  }
}
