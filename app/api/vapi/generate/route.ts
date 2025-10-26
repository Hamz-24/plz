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

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// --- helper to unwrap Vapi's nested payload ---
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
        const transcript =
            msg?.artifact?.messages?.map((m: any) => m.content)?.join(" ")?.trim() || "";
        return { args: tool, assistantVars, transcript };
    }
    return { args: body ?? {}, assistantVars: {}, transcript: "" };
}

// --- clean string helper ---
function cleanStr(s?: string) {
    return typeof s === "string" ? s.trim() : undefined;
}

// --- safely parse Gemini output ---
function parseQuestionsSafe(raw: string): string[] {
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.map(String);
    } catch (_) {}

    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
        try {
            const arr = JSON.parse(match[0]);
            if (Array.isArray(arr)) return arr.map(String);
        } catch (_) {}
    }

    return raw
        .split(/\r?\n+/)
        .map((s) => s.replace(/^[\-\*\d\.\)\s]+/, "").trim())
        .filter(Boolean);
}

// --- Gemini inference helper ---
async function inferMissingFields(transcript: string, fallback: any) {
    if (!transcript) return fallback;

    const prompt = `
You are a precise JSON-only AI.
Extract interview-related details (role, techstack, level, type, and amount) from this transcript.

Transcript:
"""
${transcript}
"""

Return ONLY valid JSON, like:
{
  "role": "Backend Developer",
  "techstack": "Node.js, Express.js, MongoDB",
  "level": "mid",
  "type": "technical",
  "amount": "7"
}

If something isn’t explicitly said, leave it blank (do NOT guess or add defaults).
`;

    try {
        const { text } = await generateText({
            model: google("gemini-2.0-flash-001"),
            prompt,
        });

        const parsed = JSON.parse(text);
        return {
            role: parsed.role ?? fallback.role,
            techstack: parsed.techstack ?? fallback.techstack,
            level: parsed.level ?? fallback.level,
            type: parsed.type ?? fallback.type,
            amount: parsed.amount ?? fallback.amount,
        };
    } catch (err) {
        console.warn("⚠️ Inference failed, using fallback");
        return fallback;
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        console.log("📥 Incoming request body:", body);

        const { args, assistantVars, transcript } = extractVapiArgs(body);

        let { role, type, level, techstack, amount, userid } = args ?? {};
        if (!userid) userid = assistantVars?.userid ?? "anonymous";

        // --- Early validation: clearer logs for missing Structured Data
        if (!role && !type && !level && !techstack && !amount) {
            console.error("❌ Missing parameters: Structured Data not attached or empty.");
            return new NextResponse(
                JSON.stringify({
                    success: false,
                    message:
                        "Structured Data fields are missing. Make sure 'role', 'type', 'level', 'techstack', and 'amount' are passed from the assistant.",
                    received: { role, type, level, techstack, amount },
                }),
                { status: 400, headers: corsHeaders }
            );
        }

        // --- Try inferring missing bits only if partial data missing
        if (!role || !techstack || !type || !level || !amount) {
            console.log("🤔 Missing fields, inferring from transcript...");
            const inferred = await inferMissingFields(transcript, {
                role,
                type,
                level,
                techstack,
                amount,
            });
            role = inferred.role;
            type = inferred.type;
            level = inferred.level;
            techstack = inferred.techstack;
            amount = inferred.amount;
        }

        console.log("🧩 Final extracted params:", {
            role,
            type,
            level,
            techstack,
            amount,
            userid,
        });

        // 🛑 Stop early if any required field is missing
        if (!role || !type || !level || !techstack || !amount) {
            console.error("❌ Missing parameters: cannot generate interview.");
            return new NextResponse(
                JSON.stringify({
                    success: false,
                    message: "Missing required interview details after inference.",
                    received: { role, type, level, techstack, amount },
                }),
                { status: 400, headers: corsHeaders }
            );
        }

        // 🧠 Generate interview questions
        const { text: geminiOutput } = await generateText({
            model: google("gemini-2.0-flash-001"),
            prompt: `
Prepare ${amount} ${type} interview questions for a ${level} ${role}.
Focus on these technologies: ${techstack}.
Return ONLY a valid JSON array like:
["Question 1", "Question 2", "Question 3"]
      `,
        });

        console.log("🧠 Gemini output:", geminiOutput);
        let parsedQuestions = parseQuestionsSafe(geminiOutput);

        if (!parsedQuestions.length) {
            console.warn("⚠️ Gemini returned empty — regenerating fallback questions...");
            const { text: backup } = await generateText({
                model: google("gemini-2.0-flash-001"),
                prompt: `Give 5 general interview questions for ${role}. Return as ["Q1","Q2","Q3"].`,
            });
            parsedQuestions = parseQuestionsSafe(backup);
        }

        // ✅ Construct Firestore document
        const interview: Record<string, any> = {
            role: cleanStr(role),
            type: cleanStr(type),
            level: cleanStr(level),
            techstack:
                typeof techstack === "string"
                    ? techstack.split(",").map((t) => t.trim()).filter(Boolean)
                    : [],
            amount: cleanStr(amount),
            questions: parsedQuestions,
            userId: userid,
            finalized: true,
            coverImage: getRandomInterviewCover(),
            createdAt: new Date().toISOString(),
        };

        // ✅ Remove empty fields
        Object.keys(interview).forEach(
            (key) =>
                (interview[key] === undefined ||
                    interview[key] === null ||
                    interview[key] === "" ||
                    (Array.isArray(interview[key]) && !interview[key].length)) &&
                delete interview[key]
        );

        console.log("💾 Saving to Firestore:", interview);
        await db.collection("interviews").add(interview);

        return new NextResponse(JSON.stringify({ success: true, data: interview }), {
            status: 200,
            headers: corsHeaders,
        });
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
