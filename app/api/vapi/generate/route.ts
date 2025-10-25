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

// ✅ Handle OPTIONS requests globally
export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: Request) {
    try {
        const { type, role, level, techstack, amount, userid } = await request.json();

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

        const interview = {
            role,
            type,
            level,
            techstack: techstack.split(","),
            questions: JSON.parse(questions),
            userId: userid,
            finalized: true,
            coverImage: getRandomInterviewCover(),
            createdAt: new Date().toISOString(),
        };

        await db.collection("interviews").add(interview);

        return new NextResponse(
            JSON.stringify({ success: true }),
            { status: 200, headers: corsHeaders }
        );
    } catch (error) {
        console.error("Error:", error);
        return new NextResponse(
            JSON.stringify({ success: false, error: String(error) }),
            { status: 500, headers: corsHeaders }
        );
    }
}

export async function GET() {
    return new NextResponse(
        JSON.stringify({ success: true, message: "API is working fine ✅" }),
        { status: 200, headers: corsHeaders }
    );
}
