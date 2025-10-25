import { generateText } from "ai";
import { google } from "@ai-sdk/google";

import { db } from "@/firebase/admin";
import { getRandomInterviewCover } from "@/lib/utils";

// Common CORS headers
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

// Handle POST request (generate interview questions)
export async function POST(request: Request) {
    // Handle preflight request
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 200, headers: CORS_HEADERS });
    }

    try {
        const { type, role, level, techstack, amount, userid } = await request.json();

        // Generate questions using AI
        const { text: questionsText } = await generateText({
            model: google("gemini-2.0-flash-001"),
            prompt: `Prepare questions for a job interview.
        The job role is ${role}.
        The job experience level is ${level}.
        The tech stack used in the job is: ${techstack}.
        The focus between behavioural and technical questions should lean towards: ${type}.
        The amount of questions required is: ${amount}.
        Please return only the questions, without any additional text.
        The questions are going to be read by a voice assistant so do not use "/" or "*" or any other special characters which might break the voice assistant.
        Return the questions formatted like this:
        ["Question 1", "Question 2", "Question 3"]
        
        Thank you! <3
      `,
        });

        // Safely parse JSON
        let questionsArray: string[] = [];
        try {
            questionsArray = JSON.parse(questionsText);
            if (!Array.isArray(questionsArray)) throw new Error("AI output is not an array");
        } catch (err) {
            console.warn("Failed to parse questions as JSON, using raw text fallback:", questionsText, err);
            questionsArray = [questionsText]; // fallback to raw string in array
        }

        // Prepare interview object
        const interview = {
            role,
            type,
            level,
            techstack: techstack.split(","),
            questions: questionsArray,
            userId: userid,
            finalized: true,
            coverImage: getRandomInterviewCover(),
            createdAt: new Date().toISOString(),
        };

        // Save to Firebase
        await db.collection("interviews").add(interview);

        return new Response(
            JSON.stringify({ success: true }),
            { status: 200, headers: CORS_HEADERS }
        );

    } catch (error: any) {
        console.error("POST /api/vapi/generate error:", error);
        return new Response(
            JSON.stringify({ success: false, error: error.message || error.toString() }),
            { status: 500, headers: CORS_HEADERS }
        );
    }
}

// Handle GET request (simple test)
export async function GET() {
    return new Response(
        JSON.stringify({ success: true, data: "Thank you!" }),
        { status: 200, headers: CORS_HEADERS }
    );
}

// Handle preflight requests globally
export async function OPTIONS() {
    return new Response(null, { status: 200, headers: CORS_HEADERS });
}
