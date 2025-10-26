import { cert, getApps, getApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

// ✅ Initialize only once (singleton-safe for Next.js)
const app = !getApps().length
    ? initializeApp({
        credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
        }),
    })
    : getApp();

// ✅ Get Auth and Firestore instances
export const auth = getAuth(app);
export const db = getFirestore(app);

// ✅ Apply settings only once
try {
    db.settings({ ignoreUndefinedProperties: true });
} catch (err: any) {
    if (!/settings\(\) can only be called once/.test(err.message)) {
        console.error("⚠️ Firestore settings error:", err);
    }
}
