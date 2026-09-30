import MarketPage, { marketMetadata } from "../landing/MarketPage";

export const metadata = marketMetadata("eu");

export default function Page() {
  return <MarketPage market="eu" />;
}
