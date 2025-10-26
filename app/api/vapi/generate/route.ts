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
        return { args: tool, assistantVars };
    }
    return { args: body ?? {}, assistantVars: {} };
}

// --- clean string helper ---
function cleanStr(s?: string) {
    return typeof s === "string" ? s.trim() : "";
}

// --- safely parse AI output ---
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

// --- fallback inference helper ---
async function inferMissingFields(inputText: string, fallback: any) {
    const prompt = `
You are a helper AI. Infer missing job interview parameters.

Input description:
${inputText}

Return a JSON object with:
{
  "role": "Frontend Developer",
  "techstack": "React, Next.js",
  "level": "junior"
}

Use defaults if not specified.
`;

    const { text } = await generateText({
        model: google("gemini-2.0-flash-001"),
        prompt,
    });

    try {
        const inferred = JSON.parse(text);
        return {
            role: inferred.role || fallback.role,
            techstack: inferred.techstack || fallback.techstack,
            level: inferred.level || fallback.level,
        };
    } catch {
        return fallback;
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        console.log("📥 Incoming request body:", body);

        const { args, assistantVars } = extractVapiArgs(body);

        let {
            role = "unknown",
            type = "technical",
            level = "junior",
            techstack = "",
            amount = "5",
            userid,
        } = args ?? {};

        if (!userid) userid = assistantVars?.userid;
        userid = userid ?? "anonymous";

        // 🧠 infer missing fields if not provided
        const transcriptText =
            JSON.stringify(body?.message?.artifact?.messages || []) ?? "";
        if (!role || role === "unknown" || !techstack) {
            console.log("🤔 Missing fields, inferring from transcript...");
            const inferred = await inferMissingFields(transcriptText, {
                role,
                techstack,
                level,
            });
            role = inferred.role;
            techstack = inferred.techstack;
            level = inferred.level;
        }

        console.log("🧩 Final extracted params:", {
            role,
            type,
            level,
            techstack,
            amount,
            userid,
        });

        // 🧠 Generate interview questions
        const { text: geminiOutput } = await generateText({
            model: google("gemini-2.0-flash-001"),
            prompt: `
Prepare ${amount} ${type} interview questions for a ${level} ${role}.
Focus on the following technologies: ${techstack}.
Return ONLY a valid JSON array, e.g.:
["Question 1", "Question 2", "Question 3"]
      `,
        });

        console.log("🧠 Gemini output:", geminiOutput);

        let parsedQuestions = parseQuestionsSafe(geminiOutput);

        // 🔁 fallback if Gemini returned nothing
        if (!parsedQuestions.length) {
            console.warn("⚠️ Gemini returned empty — regenerating fallback questions...");
            const { text: backup } = await generateText({
                model: google("gemini-2.0-flash-001"),
                prompt: `Give 5 generic ${type} interview questions for a ${level} ${role}. Return as ["Q1","Q2","Q3"].`,
            });
            parsedQuestions = parseQuestionsSafe(backup);
        }

        // ✅ Construct Firestore object
        const interview = {
            role: cleanStr(role),
            type: cleanStr(type),
            level: cleanStr(level),
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

        // ✅ Remove undefined or empty values
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
