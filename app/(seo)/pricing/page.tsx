import SeoPage, { seoMetadata } from "../../seo/SeoPage";
import { PRICING } from "../../seo/index";

export const metadata = seoMetadata(PRICING);
export default function Page() { return <SeoPage p={PRICING} />; }
