import { NextResponse } from "next/server";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { db } from "@/firebase/admin";
import { getRandomInterviewCover } from "@/lib/utils";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: Request) {
    let body: any;
    try {
        body = await request.json();
        console.log("📥 Request body:", body);
    } catch (err) {
        console.error("❌ Failed to parse JSON body:", err);
        return new NextResponse(
            JSON.stringify({ success: false, error: "Invalid JSON body" }),
            { status: 400, headers: corsHeaders }
        );
    }

    const { type, role, level, techstack, amount, userid } = body;

    let questionsRaw: string;
    try {
        const { text } = await generateText({
            model: google("gemini-2.0-flash-001"),
            prompt: `
        Prepare questions for a job interview.
        Role: ${role}, Level: ${level}, Tech Stack: ${techstack}, Type: ${type}, Amount: ${amount}.
        Return questions like ["Q1", "Q2"] only.
      `,
        });
        questionsRaw = text;
        console.log("🧠 Gemini raw output:", questionsRaw);
    } catch (err) {
        console.error("❌ Gemini generateText failed:", err);
        return new NextResponse(
            JSON.stringify({ success: false, error: "AI generation failed", details: String(err) }),
            { status: 500, headers: corsHeaders }
        );
    }

    let parsedQuestions: string[];
    try {
        parsedQuestions = JSON.parse(questionsRaw);
    } catch {
        parsedQuestions = questionsRaw
            .split(/\n+/)
            .filter(q => q.trim().length > 0)
            .map(q => q.replace(/^\d+\.?\s*/, "").trim());
    }

    const interview = {
        role,
        type,
        level,
        techstack: techstack.split(",").map((t: string) => t.trim()),
        questions: parsedQuestions,
        userId: userid,
        finalized: true,
        coverImage: getRandomInterviewCover(),
        createdAt: new Date().toISOString(),
    };

    try {
        console.log("💾 Saving interview to Firestore:", interview);
        await db.collection("interviews").add(interview);
    } catch (err) {
        console.error("❌ Firestore write failed:", err);
        return new NextResponse(
            JSON.stringify({ success: false, error: "Firestore write failed", details: String(err) }),
            { status: 500, headers: corsHeaders }
        );
    }

    return new NextResponse(
        JSON.stringify({ success: true, data: interview }),
        { status: 200, headers: corsHeaders }
    );
}

export async function GET() {
    return new NextResponse(
        JSON.stringify({ success: true, message: "API is working fine ✅" }),
        { status: 200, headers: corsHeaders }
    );
}
