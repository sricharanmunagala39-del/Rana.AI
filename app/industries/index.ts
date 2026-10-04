// All industry experience pages, in menu order.
import type { Industry } from "./types";
import { HR } from "./data/hr";
import { REAL_ESTATE } from "./data/realestate";
import { EDUCATION } from "./data/education";
import { HEALTHCARE } from "./data/healthcare";
import { BFSI } from "./data/bfsi";
import { RETAIL } from "./data/retail";
import { HOSPITALITY } from "./data/hospitality";
import { AUTO } from "./data/auto";
import { TECH } from "./data/tech";

export const INDUSTRY_LIST: Industry[] = [HR, REAL_ESTATE, EDUCATION, HEALTHCARE, BFSI, RETAIL, HOSPITALITY, AUTO, TECH];
/** Old links keep working. */
export const INDUSTRY_ALIASES: Record<string, string> = { finance: "bfsi", "hr": "hr-recruitment", recruitment: "hr-recruitment", "e-commerce": "ecommerce", retail: "ecommerce", "travel": "hospitality", auto: "automobile", automotive: "automobile", it: "it-saas", tech: "it-saas" };
export const industryOf = (slug: string): Industry | undefined => INDUSTRY_LIST.find((i) => i.slug === (INDUSTRY_ALIASES[slug] || slug));
export const useCaseOf = (ind: Industry, key: string) => ind.useCases.find((u) => u.key === key);
export type { Industry, UseCase } from "./types";
