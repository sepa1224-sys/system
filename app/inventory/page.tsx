import { redirect } from "next/navigation";

// 仕入れ表は「仕入れ」ページのタブに統合した。
// 古いブックマークやリンクから来ても迷わないように移動させる。
export default function InventoryPage() {
  redirect("/shiire?tab=sheet");
}
