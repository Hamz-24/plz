import { interviewCovers, mappings } from "@/constants";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

const techIconBaseURL = "https://cdn.jsdelivr.net/gh/devicons/devicon/icons";

/**
 * ✅ Normalize technology names (React.js → react, Next.js → nextjs, etc.)
 */
const normalizeTechName = (tech: string) => {
    if (!tech) return "";
    const key = tech.toLowerCase().replace(/\.js$/, "").replace(/\s+/g, "");
    return mappings[key as keyof typeof mappings] || key;
};

/**
 * ✅ Return technology logo URLs safely.
 * Prevents crashes and avoids network calls for missing icons.
 */
export const getTechLogos = async (techArray?: string[]) => {
    // 🔒 Prevents `.map` crash if undefined or empty
    if (!Array.isArray(techArray) || techArray.length === 0) {
        return [];
    }

    // ✅ Map technologies to CDN URLs, fallback to local icon
    return techArray.map((tech) => {
        const normalized = normalizeTechName(tech);
        return {
            tech: tech || "Unknown",
            url: normalized
                ? `${techIconBaseURL}/${normalized}/${normalized}-original.svg`
                : "/tech.svg", // fallback for unrecognized tech
        };
    });
};

/**
 * ✅ Pick a random interview cover (fixed missing slash bug)
 */
export const getRandomInterviewCover = () => {
    const randomIndex = Math.floor(Math.random() * interviewCovers.length);
    return `/covers/${interviewCovers[randomIndex]}`;
};
