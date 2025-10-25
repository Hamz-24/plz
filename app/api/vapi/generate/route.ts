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

    // ✅ Provide defaults so Firestore never sees undefined
    const {
        type = "technical",
        role = "unknown",
        level = "junior",
        techstack = "",
        amount = "5",
        userid = "anonymous",
    } = body ?? {};

    // ✅ Generate questions safely
    let questionsRaw = "";
    try {
        const { text } = await generateText({
            model: google("gemini-2.0-flash-001"),
            prompt: `
        Prepare questions for a job interview.
        Role: ${role}, Level: ${level}, Tech Stack: ${techstack},
        Type: ${type}, Amount: ${amount}.
        Return questions like ["Q1", "Q2"] only.
      `,
        });
        questionsRaw = text ?? "";
        console.log("🧠 Gemini raw output:", questionsRaw);
    } catch (err) {
        console.error("❌ Gemini generateText failed:", err);
        return new NextResponse(
            JSON.stringify({
                success: false,
                error: "AI generation failed",
                details: String(err),
            }),
            { status: 500, headers: corsHeaders }
        );
    }

    // ✅ Parse questions safely
    let parsedQuestions: string[];
    try {
        parsedQuestions = JSON.parse(questionsRaw);
    } catch {
        parsedQuestions = questionsRaw
            .split(/\n+/)
            .filter((q) => q.trim().length > 0)
            .map((q) => q.replace(/^\d+\.?\s*/, "").trim());
    }

    // ✅ Build interview object
    const interview = {
        role,
        type,
        level,
        techstack: String(techstack)
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        questions: parsedQuestions,
        userId: userid,
        finalized: true,
        coverImage: getRandomInterviewCover(),
        createdAt: new Date().toISOString(),
    };

    // ✅ Strip undefined (Firestore disallows them)
    const cleanInterview: Record<string, any> = {};
    for (const [key, value] of Object.entries(interview)) {
        if (value !== undefined) cleanInterview[key] = value;
    }

    // ✅ Save to Firestore
    try {
        console.log("💾 Saving interview to Firestore:", cleanInterview);
        await db.collection("interviews").add(cleanInterview);
    } catch (err) {
        console.error("❌ Firestore write failed:", err);
        return new NextResponse(
            JSON.stringify({
                success: false,
                error: "Firestore write failed",
                details: String(err),
            }),
            { status: 500, headers: corsHeaders }
        );
    }

    return new NextResponse(
        JSON.stringify({ success: true, data: cleanInterview }),
        { status: 200, headers: corsHeaders }
    );
}

export async function GET() {
    return new NextResponse(
        JSON.stringify({ success: true, message: "API is working fine ✅" }),
        { status: 200, headers: corsHeaders }
    );
}
