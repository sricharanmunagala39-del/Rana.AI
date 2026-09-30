import MarketPage, { marketMetadata } from "../landing/MarketPage";

export const metadata = marketMetadata("ae");

export default function Page() {
  return <MarketPage market="ae" />;
}
