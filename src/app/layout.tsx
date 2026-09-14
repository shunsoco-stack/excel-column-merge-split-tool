import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Excel列結合・分割ツール | 列のひと手間を、ひとクリックに。",
  description: "Excel・CSVの列をコード不要で結合・分割・並び替え。変更プレビュー、Undo、レシピ、CSV・XLSX出力までブラウザ内で完結します。",
  applicationName: "Excel列結合・分割ツール",
  keywords: ["Excel", "CSV", "列結合", "列分割", "業務効率化ツール", "Excel・CSV加工"],
};
export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  return <html lang="ja"><body>{children}</body></html>;
}
