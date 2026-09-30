import SeoPage, { seoMetadata } from "../../seo/SeoPage";
import PriceSwitcher from "../../seo/PriceSwitcher";
import { PRICING } from "../../seo/index";

export const metadata = seoMetadata(PRICING);
export default function Page() { return <SeoPage p={PRICING}><PriceSwitcher /></SeoPage>; }
