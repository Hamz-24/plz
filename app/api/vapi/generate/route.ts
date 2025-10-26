import { NextResponse } from "next/server";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { db } from "@/firebase/admin";
import { getRandomInterviewCover } from "@/lib/utils";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "*",
};

// ✅ Handle preflight requests
export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        console.log("📥 Incoming request body:", body);

        const {
            type = "technical",
            role = "unknown",
            level = "junior",
            techstack = "",
            amount = "5",
            userid = "anonymous", // 🔥 lowercase
        } = body ?? {};

        console.log("🧩 Extracted userid:", userid);

        // 🧠 Generate questions
        const { text: questions } = await generateText({
            model: google("gemini-2.0-flash-001"),
            prompt: `
      Prepare questions for a job interview.
      The job role is ${role}.
      The job experience level is ${level}.
      The tech stack used in the job is: ${techstack}.
      The focus between behavioural and technical questions should lean towards: ${type}.
      The amount of questions required is: ${amount}.
      Please return only the questions, formatted like this:
      ["Question 1", "Question 2"]
    `,
        });

        console.log("🧠 Gemini output:", questions);

        // ✅ Safe parsing of AI output
        let parsedQuestions: string[];
        try {
            parsedQuestions = JSON.parse(questions);
        } catch {
            parsedQuestions = questions
                .split(/\n+/)
                .map((q) => q.replace(/^\d+\.?\s*/, "").trim())
                .filter(Boolean);
        }

        // ✅ Build interview object safely
        const interview = {
            role,
            type,
            level,
            techstack:
                typeof techstack === "string"
                    ? techstack.split(",").map((t) => t.trim())
                    : [],
            questions: parsedQuestions,
            userId: userid,
            finalized: true,
            coverImage: getRandomInterviewCover(),
            createdAt: new Date().toISOString(),
        };

        // ✅ Remove undefined or empty values (to avoid Firestore rejection)
        const sanitizedInterview: Record<string, any> = {};
        for (const [key, value] of Object.entries(interview)) {
            if (
                value !== undefined &&
                value !== null &&
                !(Array.isArray(value) && value.length === 0)
            ) {
                sanitizedInterview[key] = value;
            }
        }

        console.log("💾 Saving to Firestore:", sanitizedInterview);

        await db.collection("interviews").add(sanitizedInterview);

        return new NextResponse(
            JSON.stringify({ success: true, data: sanitizedInterview }),
            { status: 200, headers: corsHeaders }
        );
    } catch (error: any) {
        console.error("❌ Error in /api/vapi/generate:", error);
        return new NextResponse(
            JSON.stringify({
                success: false,
                message: "Server crashed",
                error: String(error),
                stack: error?.stack,
            }),
            { status: 500, headers: corsHeaders }
        );
    }
}

export async function GET() {
    return new NextResponse(
        JSON.stringify({
            success: true,
            message: "API is working fine ✅",
        }),
        { status: 200, headers: corsHeaders }
    );
}
