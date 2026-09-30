import SeoPage, { seoMetadata } from "../../../seo/SeoPage";
import CostCalculator from "../../../seo/CostCalculator";
import { COST_TOOL } from "../../../seo/data/growth";

export const metadata = seoMetadata(COST_TOOL);
export default function Page() { return <SeoPage p={COST_TOOL}><CostCalculator /></SeoPage>; }
