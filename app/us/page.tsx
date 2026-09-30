import MarketPage, { marketMetadata } from "../landing/MarketPage";

export const metadata = marketMetadata("us");

export default function Page() {
  return <MarketPage market="us" />;
}
