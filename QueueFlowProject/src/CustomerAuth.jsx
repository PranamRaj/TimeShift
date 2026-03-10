import { useState } from "react";
import {
    createUserWithEmailAndPassword,
    sendEmailVerification,
    sendPasswordResetEmail,
    signOut,
    signInWithEmailAndPassword,
    signInWithPopup,
    updateProfile,
} from "firebase/auth";
import { auth, googleProvider } from "./firebase";

export default function CustomerAuth({ onAuthSuccess }) {
    const [isSignUp, setIsSignUp] = useState(false);
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    const mapAuthError = (code) => {
        if (code === "auth/invalid-email") return "Please enter a valid email address.";
        if (code === "auth/invalid-credential") return "Invalid email or password.";
        if (code === "auth/email-already-in-use") return "An account already exists for this email.";
        if (code === "auth/weak-password") return "Password should be at least 6 characters.";
        if (code === "auth/popup-closed-by-user") return "Google sign-in was canceled.";
        if (code === "auth/user-not-found") return "No account found for this email.";
        if (code === "auth/too-many-requests") return "Too many attempts. Please try again later.";
        return "Authentication failed. Please try again.";
    };

    const submit = async (e) => {
        e.preventDefault();
        setError("");
        setMessage("");

        const cleanEmail = email.trim().toLowerCase();
        const cleanName = name.trim();

        if (!cleanEmail || !password || (isSignUp && !cleanName)) {
            setError("Please fill all required fields.");
            return;
        }

        try {
            if (isSignUp) {
                const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
                if (cleanName) {
                    await updateProfile(cred.user, { displayName: cleanName });
                }
                await sendEmailVerification(cred.user);
                await signOut(auth);
                setMessage("Verification email sent. Verify your email, then sign in.");
                setIsSignUp(false);
                setPassword("");
                return;
            }

            const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
            if (!cred.user.emailVerified) {
                await sendEmailVerification(cred.user);
                await signOut(auth);
                setError("Email not verified. We sent a new verification link to your inbox.");
                return;
            }
            onAuthSuccess({
                role: "customer",
                name: cred.user.displayName || "Customer",
                email: cred.user.email || cleanEmail,
                uid: cred.user.uid,
            });
        } catch (err) {
            setError(mapAuthError(err?.code));
        }
    };

    const loginWithGoogle = async () => {
        setError("");
        setMessage("");
        try {
            const cred = await signInWithPopup(auth, googleProvider);
            onAuthSuccess({
                role: "customer",
                name: cred.user.displayName || "Customer",
                email: cred.user.email || "",
                uid: cred.user.uid,
            });
        } catch (err) {
            setError(mapAuthError(err?.code));
        }
    };

    const forgotPassword = async () => {
        setError("");
        setMessage("");
        const cleanEmail = email.trim().toLowerCase();
        if (!cleanEmail) {
            setError("Enter your email first to reset password.");
            return;
        }

        try {
            await sendPasswordResetEmail(auth, cleanEmail);
            setMessage("Password reset email sent. Check your inbox.");
        } catch (err) {
            setError(mapAuthError(err?.code));
        }
    };

    return (
        <div
            style={{
                width: "100%",
                maxWidth: 420,
                borderRadius: 18,
                background: "#fff",
                border: "1.5px solid #dbeafe",
                boxShadow: "0 8px 26px rgba(37,99,235,0.12)",
                padding: "22px 20px",
            }}
        >
            <p
                style={{
                    fontSize: 10,
                    color: "#2563eb",
                    textTransform: "uppercase",
                    letterSpacing: "0.15em",
                    fontFamily: "DM Mono, monospace",
                    margin: 0,
                }}
            >
                Customer Access
            </p>
            <h2
                style={{
                    margin: "6px 0 0",
                    fontSize: 24,
                    color: "#1e293b",
                    fontFamily: "Fraunces, serif",
                    letterSpacing: "-0.02em",
                }}
            >
                {isSignUp ? "Create Customer Account" : "Customer Sign In"}
            </h2>

            <form onSubmit={submit} style={{ marginTop: 16, display: "grid", gap: 10 }}>
                {isSignUp && (
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Full name"
                        style={{
                            height: 42,
                            borderRadius: 10,
                            border: "1.5px solid #bfdbfe",
                            padding: "0 12px",
                            outline: "none",
                            fontSize: 14,
                        }}
                    />
                )}

                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
                    style={{
                        height: 42,
                        borderRadius: 10,
                        border: "1.5px solid #bfdbfe",
                        padding: "0 12px",
                        outline: "none",
                        fontSize: 14,
                    }}
                />

                <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    style={{
                        height: 42,
                        borderRadius: 10,
                        border: "1.5px solid #bfdbfe",
                        padding: "0 12px",
                        outline: "none",
                        fontSize: 14,
                    }}
                />

                {error && (
                    <p
                        style={{
                            margin: 0,
                            padding: "8px 10px",
                            borderRadius: 9,
                            background: "#fee2e2",
                            color: "#b91c1c",
                            fontSize: 12,
                            fontWeight: 600,
                        }}
                    >
                        {error}
                    </p>
                )}

                {message && (
                    <p
                        style={{
                            margin: 0,
                            padding: "8px 10px",
                            borderRadius: 9,
                            background: "#dcfce7",
                            color: "#166534",
                            fontSize: 12,
                            fontWeight: 600,
                        }}
                    >
                        {message}
                    </p>
                )}

                <button
                    type="submit"
                    style={{
                        height: 42,
                        borderRadius: 10,
                        border: "none",
                        background: "linear-gradient(135deg,#2563eb,#1d4ed8)",
                        color: "#fff",
                        fontSize: 13,
                        fontWeight: 700,
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        fontFamily: "DM Mono, monospace",
                    }}
                >
                    {isSignUp ? "Sign Up" : "Sign In"}
                </button>

                <button
                    type="button"
                    onClick={loginWithGoogle}
                    style={{
                        height: 42,
                        borderRadius: 10,
                        border: "1.5px solid #bfdbfe",
                        background: "#eff6ff",
                        color: "#1e3a8a",
                        fontSize: 12,
                        fontWeight: 700,
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        fontFamily: "DM Mono, monospace",
                    }}
                >
                    Continue With Google
                </button>

                {!isSignUp && (
                    <button
                        type="button"
                        onClick={forgotPassword}
                        style={{
                            all: "unset",
                            cursor: "pointer",
                            textAlign: "center",
                            fontSize: 12,
                            color: "#1d4ed8",
                            fontWeight: 700,
                            fontFamily: "DM Mono, monospace",
                            padding: "4px 0",
                        }}
                    >
                        Forgot Password?
                    </button>
                )}
            </form>

            <button
                onClick={() => {
                    setIsSignUp((v) => !v);
                    setError("");
                }}
                style={{
                    all: "unset",
                    cursor: "pointer",
                    marginTop: 10,
                    fontSize: 12,
                    color: "#2563eb",
                    fontWeight: 700,
                    fontFamily: "DM Mono, monospace",
                }}
            >
                {isSignUp ? "Have an account? Sign In" : "New customer? Create account"}
            </button>
        </div>
    );
}
