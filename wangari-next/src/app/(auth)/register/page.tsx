"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowRight, User, Mail, Lock, Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { register, googleLogin, AccountNotProvisionedError } from "@/lib/auth-client";

import { AuthAvatarContext } from "@/app/(auth)/layout";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
};
const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

export default function RegisterPage() {
  const router = useRouter();
  const { setAvatarState } = React.useContext(AuthAvatarContext);
  const [form, setForm] = React.useState({
    name: "",
    email: "",
    password: "",
    farmName: "",
  });
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  // The login page sends a farmer who tapped Google here with their verified
  // address (?googleEmail=...). Pre-fill it so they do not retype an address
  // Google has already proven - they only need to add a password and name.
  React.useEffect(() => {
    const googleEmail = new URLSearchParams(window.location.search).get("googleEmail");
    if (googleEmail) {
      setForm((f) => (f.email ? f : { ...f, email: googleEmail }));
      setError("Google sign-in works. Add your name and password below to finish creating your farm.");
    }
  }, []);

  const googleButtonRef = React.useRef<HTMLDivElement>(null);
  const [googleLoaded, setGoogleLoaded] = React.useState(false);

  React.useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

    if (!clientId) return; // No client ID configured — skip Google button

    const setupGoogle = () => {
      if (window.google?.accounts?.id) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async (response: any) => {
            try {
              setError("");
              setLoading(true);
              setAvatarState("loading");
              await googleLogin(response.credential);
              setAvatarState("success");
              router.push("/dashboard");
            } catch (err) {
              setAvatarState("idle");
              // The server deliberately never auto-creates a farm from a Google
              // tap. On the LOGIN page that is correct - the farmer is sent to
              // register. But here the farmer is ALREADY registering, so
              // surfacing "no Wangari account uses this Google account yet" was
              // a dead end that looked like a failure. Google has proven the
              // email; all that is left is naming the farm. Carry the identity
              // into the form and let them finish.
              if (err instanceof AccountNotProvisionedError) {
                setForm((f) => ({ ...f, email: err.email ?? f.email }));
                setError(
                  "Google sign-in works. Add your name and password below to finish creating your farm."
                );
              } else {
                setError(err instanceof Error ? err.message : "Google sign-up failed");
              }
            } finally {
              setLoading(false);
            }
          },
        });
        if (googleButtonRef.current) {
          window.google.accounts.id.renderButton(googleButtonRef.current, {
            theme: "outline",
            size: "large",
            width: "100%",
            text: "signup_with",
          });
        }
        setGoogleLoaded(true);
      }
    };

    if (window.google?.accounts?.id) {
      setupGoogle();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = setupGoogle;
    document.head.appendChild(script);
  }, [router, setAvatarState]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    setAvatarState("loading");

    try {
      await register(form.name, form.email, form.password);
      setAvatarState("success");
      router.push(`/verify-email?email=${encodeURIComponent(form.email)}`);
    } catch (err) {
      setAvatarState("error");
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const fields = [
    { id: "name", label: "Full Name", type: "text", placeholder: "John Kamau", icon: User, key: "name" as const, avatarState: "typing-name" as const },
    { id: "email", label: "Email", type: "email", placeholder: "you@example.com", icon: Mail, key: "email" as const, avatarState: "typing-email" as const },
    { id: "farmName", label: "Farm Name", type: "text", placeholder: "Kamau Farm", icon: Sprout, key: "farmName" as const, avatarState: "typing-farm" as const },
    { id: "password", label: "Password", type: "password", placeholder: "At least 6 characters", icon: Lock, key: "password" as const, avatarState: "typing-password" as const },
  ];

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={stagger}
      className="space-y-8"
    >
      {/* Heading */}
      <motion.div variants={fadeUp}>
        <h1 className="text-3xl font-extrabold text-wangari-heading tracking-tight">
          Create your farm account
        </h1>
        <p className="mt-2 text-sm text-wangari-muted">
          Start managing your farm in minutes — it&apos;s free
        </p>
      </motion.div>

      {/* Error */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 font-medium"
        >
          {error}
        </motion.div>
      )}

      {/* Form */}
      <motion.form
        variants={fadeUp}
        onSubmit={handleSubmit}
        className="space-y-4"
      >
        {fields.map((field) => (
          <motion.div key={field.id} variants={fadeUp} className="space-y-2">
            <Label htmlFor={field.id} className="text-sm font-semibold text-wangari-text">
              {field.label}
            </Label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-wangari-subtle">
                <field.icon className="h-4 w-4" />
              </div>
              <Input
                id={field.id}
                type={field.type}
                placeholder={field.placeholder}
                value={form[field.key]}
                onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                onFocus={() => setAvatarState(field.avatarState)}
                onBlur={() => setAvatarState("idle")}
                required
                minLength={field.key === "password" ? 6 : undefined}
                className="h-12 rounded-xl border-wangari-border focus:border-wangari-green-800 focus:ring-wangari-green-800/20 transition-all pl-10"
              />
            </div>
          </motion.div>
        ))}

        <motion.div variants={fadeUp} className="pt-2">
          <Button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-xl bg-wangari-green-800 hover:bg-wangari-green-900 text-white font-bold text-sm transition-all duration-200 hover:shadow-lg hover:shadow-wangari-green-800/25 hover:-translate-y-0.5 cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Creating account...
              </>
            ) : (
              <>
                Create Account
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </motion.div>
      </motion.form>

      {/* Divider */}
      <motion.div variants={fadeUp} className="flex items-center gap-4">
        <div className="flex-1 h-px bg-wangari-border" />
        <span className="text-xs text-wangari-subtle font-medium">or</span>
        <div className="flex-1 h-px bg-wangari-border" />
      </motion.div>

      {/* Google Sign-Up */}
      <div className="space-y-3 relative z-10">
        <div
          ref={googleButtonRef}
          className="w-full cursor-pointer flex justify-center min-h-[48px]"
          onClick={() => {
            if (window.google?.accounts?.id) {
              window.google.accounts.id.prompt();
            }
          }}
        />
        {!googleLoaded && (
          <button
            type="button"
            onClick={() => {
              if (window.google?.accounts?.id) {
                // Already loaded — just prompt
                window.google.accounts.id.prompt();
                setGoogleLoaded(true);
              } else {
                // Silently retry (no error shown on mobile)
                const existing = document.querySelector('script[src*="accounts.google.com/gsi"]');
                if (!existing) {
                  const s = document.createElement("script");
                  s.src = "https://accounts.google.com/gsi/client";
                  s.async = true;
                  s.onload = () => {
                    if (window.google?.accounts?.id) {
                      const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
                          if (!clientId) return;
                      window.google.accounts.id.initialize({ client_id: clientId, callback: async (r: any) => { try { await googleLogin(r.credential); router.push("/dashboard"); } catch (e: any) { if (e instanceof AccountNotProvisionedError) { setForm((f) => ({ ...f, email: e.email ?? f.email })); setError("Google sign-in works. Add your name and password below to finish creating your farm."); } else { setError(e?.message || "Google sign-up failed"); } } } });
                      if (googleButtonRef.current) window.google.accounts.id.renderButton(googleButtonRef.current, { theme: "outline", size: "large", width: "100%", text: "signup_with" });
                      setGoogleLoaded(true);
                    }
                  };
                  document.head.appendChild(s);
                }
              }
            }}
            className="w-full h-12 rounded-xl border border-wangari-border flex items-center justify-center gap-3 hover:bg-gray-50 active:scale-98 transition-all cursor-pointer bg-white"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            <span className="text-sm font-bold text-wangari-text">Sign up with Google</span>
          </button>
        )}
        <p className="text-[10px] text-wangari-subtle text-center">Only Gmail and Outlook emails accepted for manual registration</p>
      </div>

      {/* Login link */}
      <motion.p variants={fadeUp} className="text-center text-sm text-wangari-muted">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-bold text-wangari-green-800 hover:underline"
        >
          Sign in
        </Link>
      </motion.p>
    </motion.div>
  );
}
