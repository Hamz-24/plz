import Image from "next/image";
import { cn, getTechLogos } from "@/lib/utils";

interface TechIconProps {
    techStack?: string[]; // ✅ make optional
}

const DisplayTechIcons = async ({ techStack = [] }: TechIconProps) => {
    // ✅ Prevent crash if techStack is undefined or empty
    const safeStack = Array.isArray(techStack) ? techStack.filter(Boolean) : [];
    const techIcons = await getTechLogos(safeStack);

    // ✅ Graceful fallback for empty or undefined tech stacks
    if (!techIcons.length) {
        return (
            <p className="text-sm text-gray-400 italic px-2">
                No tech stack specified
            </p>
        );
    }

    return (
        <div className="flex flex-row items-center">
            {techIcons.slice(0, 3).map(({ tech, url }, index) => (
                <div
                    key={tech}
                    className={cn(
                        "relative group bg-dark-300 rounded-full p-2 flex flex-center",
                        index >= 1 && "-ml-3"
                    )}
                >
                    <span className="tech-tooltip">{tech}</span>
                    <Image
                        src={url}
                        alt={tech}
                        width={100}
                        height={100}
                        className="size-5"
                    />
                </div>
            ))}

            {/* ✅ If more than 3 technologies exist, show “+N” badge */}
            {techIcons.length > 3 && (
                <div className="bg-dark-300 text-xs text-gray-300 rounded-full px-2 py-1 ml-2">
                    +{techIcons.length - 3}
                </div>
            )}
        </div>
    );
};

export default DisplayTechIcons;
