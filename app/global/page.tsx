import MarketPage, { marketMetadata } from "../landing/MarketPage";

export const metadata = marketMetadata("global");

export default function Page() {
  return <MarketPage market="global" />;
}
