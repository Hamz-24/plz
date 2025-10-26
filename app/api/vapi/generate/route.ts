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

// ✅ Handle preflight (CORS)
export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        console.log("📥 Incoming request body:", body);

        // ✅ Destructure safely and match Vapi variable casing
        const {
            type = "technical",
            role = "unknown",
            level = "junior",
            techstack = "",
            amount = "5",
            userid = "anonymous", // <-- lowercase to match your Vapi variable
        } = body || {};

        // 🔍 Confirm user ID received
        console.log("🧩 Extracted userid:", userid);

        // 🧠 Generate interview questions
        const { text: questions } = await generateText({
            model: google("gemini-2.0-flash-001"),
            prompt: `
        Prepare questions for a job interview.
        The job role is ${role}.
        The job experience level is ${level}.
        The tech stack used in the job is: ${techstack}.
        The focus between behavioural and technical questions should lean towards: ${type}.
        The amount of questions required is: ${amount}.
        Please return only the questions, without any additional text.
        The questions are going to be read by a voice assistant so do not use "/" or "*" or any other special characters.
        Return the questions formatted like this: ["Question 1", "Question 2"]
      `,
        });

        console.log("🧠 Gemini output:", questions);

        // ✅ Safe parse
        let parsedQuestions: string[];
        try {
            parsedQuestions = JSON.parse(questions);
        } catch {
            parsedQuestions = questions
                .split(/\n+/)
                .map((q) => q.replace(/^\d+\.?\s*/, "").trim())
                .filter(Boolean);
        }

        // ✅ Create Firestore record (no undefineds)
        const interview = {
            role,
            type,
            level,
            techstack:
                typeof techstack === "string"
                    ? techstack.split(",").map((t) => t.trim())
                    : [],
            questions: parsedQuestions,
            userId: userid, // ✅ use lowercase key from Vapi
            finalized: true,
            coverImage: getRandomInterviewCover(),
            createdAt: new Date().toISOString(),
        };

        console.log("💾 Saving interview to Firestore:", interview);

        await db.collection("interviews").add(interview);

        return new NextResponse(
            JSON.stringify({ success: true, data: interview }),
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

// ✅ Health check
export async function GET() {
    return new NextResponse(
        JSON.stringify({
            success: true,
            message: "API is working fine ✅",
        }),
        { status: 200, headers: corsHeaders }
    );
}
