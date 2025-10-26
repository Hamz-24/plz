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
            msg?.artifact?.messages
                ?.map((m: any) => m.content)
                ?.join(" ")
                ?.trim() || "";
        return { args: tool, assistantVars, transcript };
    }
    return { args: body ?? {}, assistantVars: {}, transcript: "" };
}

// --- clean string helper ---
function cleanStr(s?: string) {
    return typeof s === "string" ? s.trim() : "";
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
You are a JSON-only AI parser. 
Extract job interview details (role, level, techstack) from the transcript below.

Transcript:
"""
${transcript}
"""

Return ONLY a valid JSON object, for example:
{
  "role": "Backend Developer",
  "techstack": "Node.js, Express.js, MongoDB",
  "level": "junior"
}

If something is not mentioned, infer the most likely default.
`;

    try {
        const { text } = await generateText({
            model: google("gemini-2.0-flash-001"),
            prompt,
        });

        const parsed = JSON.parse(text);
        return {
            role: parsed.role || fallback.role,
            techstack: parsed.techstack || fallback.techstack,
            level: parsed.level || fallback.level,
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

        let {
            role = "unknown",
            type = "technical",
            level = "junior",
            techstack = "",
            amount = "5",
            userid,
        } = args ?? {};

        if (!userid) userid = assistantVars?.userid ?? "anonymous";

        // 🧠 Use Gemini to infer missing fields from speech transcript
        if (!role || role === "unknown" || !techstack || !level) {
            console.log("🤔 Missing fields, inferring from transcript...");
            const inferred = await inferMissingFields(transcript, {
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
