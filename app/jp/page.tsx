import MarketPage, { marketMetadata } from "../landing/MarketPage";

export const metadata = marketMetadata("jp");

export default function Page() {
  return <MarketPage market="jp" />;
}
