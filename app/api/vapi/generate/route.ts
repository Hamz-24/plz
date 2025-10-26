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

// --- helper: unwrap Vapi’s message payload ---
function extractVapiArgs(body: any) {
    const msg = body?.message;
    if (!msg) return { args: {}, assistantVars: {}, transcript: "" };

    const toolArgs =
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

    return { args: toolArgs, assistantVars, transcript };
}

function cleanStr(s?: string) {
    return typeof s === "string" && s.trim() ? s.trim() : undefined;
}

// --- parse Gemini output safely ---
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

// --- if structured data fails, infer minimal fields ---
async function inferMissingFields(transcript: string) {
    if (!transcript) return {};
    const prompt = `
You are a JSON-only AI.
Extract role, type, level, techstack, and amount from the transcript below.

Transcript:
"""
${transcript}
"""

Return only JSON like:
{
  "role": "Backend Developer",
  "type": "technical",
  "level": "mid",
  "techstack": "Node.js, Express",
  "amount": "5"
}`;
    try {
        const { text } = await generateText({
            model: google("gemini-2.0-flash-001"),
            prompt,
        });
        return JSON.parse(text);
    } catch {
        return {};
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        console.log("📥 Received:", body);

        const { args, assistantVars, transcript } = extractVapiArgs(body);

        // extract params from args or assistantVars
        let { role, type, level, techstack, amount, userid } = args ?? {};

        if (!userid) userid = assistantVars?.userid ?? "anonymous";

        // attempt inference only if missing
        if (!role || !type || !level || !techstack || !amount) {
            console.log("🤔 Missing fields, inferring from transcript...");
            const inferred = await inferMissingFields(transcript);
            role = role || inferred.role;
            type = type || inferred.type;
            level = level || inferred.level;
            techstack = techstack || inferred.techstack;
            amount = amount || inferred.amount;
        }

        console.log("🧩 Final extracted params:", {
            role,
            type,
            level,
            techstack,
            amount,
            userid,
        });

        // validate required fields
        if (!role || !type || !level || !techstack || !amount) {
            console.error("❌ Missing parameters: cannot generate interview.");
            return new NextResponse(
                JSON.stringify({
                    success: false,
                    message: "Missing structured data fields from assistant.",
                }),
                { status: 400, headers: corsHeaders }
            );
        }

        // Generate interview questions
        const { text: geminiOutput } = await generateText({
            model: google("gemini-2.0-flash-001"),
            prompt: `
Prepare ${amount} ${type} interview questions for a ${level} ${role}.
Focus on these technologies: ${techstack}.
Return only a valid JSON array like:
["Question 1", "Question 2", "Question 3"]
      `,
        });

        console.log("🧠 Gemini output:", geminiOutput);
        let parsedQuestions = parseQuestionsSafe(geminiOutput);

        if (!parsedQuestions.length) {
            console.warn("⚠️ Empty response — fallback questions generated.");
            const { text: backup } = await generateText({
                model: google("gemini-2.0-flash-001"),
                prompt: `Give 5 general ${type} questions for ${role}. Return as ["Q1","Q2","Q3"].`,
            });
            parsedQuestions = parseQuestionsSafe(backup);
        }

        // construct interview doc
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
