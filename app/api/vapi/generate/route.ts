import { generateText } from "ai";
import { google } from "@ai-sdk/google";

import { db } from "@/firebase/admin";
import { getRandomInterviewCover } from "@/lib/utils";

// Common headers for CORS
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*', // allow all domains
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

export async function POST(request: Request) {
    // Handle preflight requests
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 200, headers: CORS_HEADERS });
    }

    const { type, role, level, techstack, amount, userid } = await request.json();

    try {
        const { text: questions } = await generateText({
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

        const interview = {
            role: role,
            type: type,
            level: level,
            techstack: techstack.split(","),
            questions: JSON.parse(questions),
            userId: userid,
            finalized: true,
            coverImage: getRandomInterviewCover(),
            createdAt: new Date().toISOString(),
        };

        await db.collection("interviews").add(interview);

        return new Response(
            JSON.stringify({ success: true }),
            { status: 200, headers: CORS_HEADERS }
        );
    } catch (error) {
        console.error("Error:", error);
        return new Response(
            JSON.stringify({ success: false, error: error }),
            { status: 500, headers: CORS_HEADERS }
        );
    }
}

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
