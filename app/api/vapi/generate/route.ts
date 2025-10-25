import { NextResponse } from "next/server";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { db } from "@/firebase/admin";
import { getRandomInterviewCover } from "@/lib/utils";

export async function POST(request: Request) {
    // 🧠 Parse JSON body safely
    let body: any;
    try {
        body = await request.json();
        console.log("📥 Request body:", body);
    } catch (err) {
        console.error("❌ Invalid JSON body:", err);
        return NextResponse.json(
            { success: false, error: "Invalid JSON body" },
            { status: 400 }
        );
    }

    // ✅ Default fallback values (so nothing is undefined)
    const {
        type = "technical",
        role = "unknown",
        level = "junior",
        techstack = "",
        amount = "5",
        userid = "anonymous",
    } = body ?? {};

    // ⚙️ Generate questions
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
        return NextResponse.json(
            { success: false, error: "AI generation failed", details: String(err) },
            { status: 500 }
        );
    }

    // 🧩 Parse Gemini output safely
    let parsedQuestions: string[];
    try {
        parsedQuestions = JSON.parse(questionsRaw);
    } catch {
        parsedQuestions = questionsRaw
            .split(/\n+/)
            .map((q) => q.trim())
            .filter(Boolean)
            .map((q) => q.replace(/^\d+\.?\s*/, ""));
    }

    // 🧱 Build the interview object
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

    // ✅ Remove any undefined properties (Firestore disallows them)
    const cleanInterview: Record<string, any> = {};
    for (const [key, value] of Object.entries(interview)) {
        if (value !== undefined) cleanInterview[key] = value;
    }

    // 💾 Save to Firestore
    try {
        console.log("💾 Saving interview to Firestore:", cleanInterview);
        const ref = await db.collection("interviews").add(cleanInterview);
        return NextResponse.json(
            { success: true, id: ref.id, data: cleanInterview },
            { status: 200 }
        );
    } catch (err) {
        console.error("❌ Firestore write failed:", err);
        return NextResponse.json(
            { success: false, error: "Firestore write failed", details: String(err) },
            { status: 500 }
        );
    }
}

// ✅ Simple health check endpoint
export async function GET() {
    return NextResponse.json(
        { success: true, message: "API is working fine ✅" },
        { status: 200 }
    );
}
