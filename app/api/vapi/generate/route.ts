import { NextResponse } from "next/server";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { db } from "@/firebase/admin";
import { getRandomInterviewCover } from "@/lib/utils";

// ✅ CORS headers
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ✅ Handle OPTIONS requests
export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// ✅ POST /vapi/generate
export async function POST(request: Request) {
    try {
        const { type, role, level, techstack, amount, userid } = await request.json();

        // 🧠 Generate questions from Gemini
        const { text: questions } = await generateText({
            model: google("gemini-2.0-flash-001"),
            prompt: `
        Prepare questions for a job interview.
        The job role is ${role}.
        The job experience level is ${level}.
        The tech stack used in the job is: ${techstack}.
        The focus between behavioural and technical questions should lean towards: ${type}.
        The amount of questions required is: ${amount}.
        Return questions like ["Q1", "Q2"] only.
      `,
        });

        console.log("🧠 Gemini raw output:", questions);

        // ✅ Safe parsing for Gemini output
        let parsedQuestions;
        try {
            parsedQuestions = JSON.parse(questions);
        } catch {
            parsedQuestions = questions
                .split(/\n+/)
                .filter(q => q.trim().length > 0)
                .map(q => q.replace(/^\d+\.?\s*/, "").trim());
        }

        // ✅ Create interview object
        const interview = {
            role,
            type,
            level,
            techstack: techstack.split(",").map(t => t.trim()),
            questions: parsedQuestions,
            userId: userid,
            finalized: true,
            coverImage: getRandomInterviewCover(),
            createdAt: new Date().toISOString(),
        };

        // ✅ Save to Firestore
        await db.collection("interviews").add(interview);

        return new NextResponse(
            JSON.stringify({ success: true, data: interview }),
            { status: 200, headers: corsHeaders }
        );
    } catch (error) {
        console.error("❌ Error in POST /vapi/generate:", error);
        return new NextResponse(
            JSON.stringify({
                success: false,
                message: "Server crashed",
                error: String(error),
                stack: (error as any)?.stack || "No stack trace",
            }),
            { status: 500, headers: corsHeaders }
        );
    }
}

// ✅ GET /vapi/generate (health check)
export async function GET() {
    return new NextResponse(
        JSON.stringify({ success: true, message: "API is working fine ✅" }),
        { status: 200, headers: corsHeaders }
    );
}
