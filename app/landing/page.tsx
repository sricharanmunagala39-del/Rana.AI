import MarketPage, { marketMetadata } from "./MarketPage";

export const metadata = marketMetadata("in");

export default function LandingPage() {
  return <MarketPage market="in" />;
}
