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

// --- helper to unwrap Vapi's tool call structure ---
function extractVapiArgs(body: any) {
    const msg = body?.message;
    if (msg?.type === "tool-calls") {
        const tool =
            msg.toolCalls?.[0]?.args ||
            msg.toolCallList?.[0]?.args ||
            msg.toolWithToolCallList?.[0]?.toolCall?.args ||
            {};
        const assistantVars =
            msg.assistant?.variableValues ||
            msg.call?.assistantOverrides?.variableValues ||
            {};
        return { args: tool, assistantVars };
    }
    return { args: body ?? {}, assistantVars: {} };
}

// --- main handler ---
export async function POST(request: Request) {
    try {
        const body = await request.json();
        console.log("📥 Incoming request body:", body);

        const { args, assistantVars } = extractVapiArgs(body);

        // ✅ Safely extract with fallbacks
        let {
            role = "unknown",
            type = "technical",
            level = "junior",
            techstack = "",
            amount = "5",
            userid,
        } = args ?? {};

        // If missing in args, fallback to assistant variables
        if (!userid) userid = assistantVars?.userid;

        userid = userid ?? "anonymous";

        console.log("🧩 Extracted params:", {
            role,
            type,
            level,
            techstack,
            amount,
            userid,
        });

        // 🧠 Generate interview questions using Gemini
        const { text: geminiOutput } = await generateText({
            model: google("gemini-2.0-flash-001"),
            prompt: `
        Prepare ${amount} ${type} interview questions for a ${level} ${role}.
        Focus on the following technologies: ${techstack}.
        Return ONLY a pure JSON array like:
        ["Question 1", "Question 2", "Question 3"]
      `,
        });

        console.log("🧠 Gemini output:", geminiOutput);

        // ✅ Parse the AI output safely
        let parsedQuestions: string[] = [];
        try {
            const maybeArray = JSON.parse(geminiOutput);
            if (Array.isArray(maybeArray)) parsedQuestions = maybeArray;
        } catch {
            // If not valid JSON, split by newlines
            const match = geminiOutput.match(/\[[\s\S]*\]/);
            if (match) {
                try {
                    parsedQuestions = JSON.parse(match[0]);
                } catch {}
            }
            if (parsedQuestions.length === 0) {
                parsedQuestions = geminiOutput
                    .split(/\r?\n+/)
                    .map((q) => q.replace(/^[\-\*\d\.\)\s]+/, "").trim())
                    .filter(Boolean);
            }
        }

        // ✅ Construct Firestore-friendly object
        const interview = {
            role,
            type,
            level,
            techstack:
                typeof techstack === "string"
                    ? techstack.split(",").map((t) => t.trim()).filter(Boolean)
                    : [],
            questions: parsedQuestions,
            userId: userid,
            finalized: true,
            coverImage: getRandomInterviewCover(),
            createdAt: new Date().toISOString(),
        };

        // ✅ Sanitize before saving
        const sanitized: Record<string, any> = {};
        for (const [key, val] of Object.entries(interview)) {
            if (
                val !== undefined &&
                val !== null &&
                !(Array.isArray(val) && val.length === 0)
            ) {
                sanitized[key] = val;
            }
        }

        console.log("💾 Saving to Firestore:", sanitized);

        await db.collection("interviews").add(sanitized);

        return new NextResponse(
            JSON.stringify({ success: true, data: sanitized }),
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
        JSON.stringify({ success: true, message: "API is working fine ✅" }),
        { status: 200, headers: corsHeaders }
    );
}
