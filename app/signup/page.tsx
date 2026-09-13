import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { signupUser } from "@/lib/auth/signup";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  async function handleSignup(formData: FormData) {
    "use server";

    const input = {
      username: String(formData.get("username") ?? ""),
      password: String(formData.get("password") ?? ""),
      confirmPassword: String(formData.get("confirmPassword") ?? ""),
      displayName: formData.get("displayName") ? String(formData.get("displayName")) : undefined,
      email: formData.get("email") ? String(formData.get("email")) : undefined,
    };

    const result = await signupUser(input);
    if (!result.ok) {
      redirect(`/signup?error=${encodeURIComponent(result.error)}`);
    }

    try {
      await signIn("credentials", {
        identifier: input.username,
        password: input.password,
        redirectTo: "/overview",
      });
    } catch (err) {
      if (err instanceof AuthError) {
        // Account was created successfully - this would only fail on an
        // unrelated auth hiccup - send them to log in manually instead of
        // losing the fact that signup itself worked.
        redirect("/login?callbackUrl=%2Foverview");
      }
      throw err;
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-900 px-6 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="block text-center font-serif text-2xl text-ink-100">
          PULSE
        </Link>
        <div className="mt-8 border border-ink-700 bg-ink-800 p-8">
          <h1 className="font-serif text-xl text-ink-100">Create your account</h1>
          <p className="mt-1 text-xs text-ink-400">
            This creates your own private workspace - separate from the shared demo data.
          </p>
          {error && <p className="mt-3 text-sm text-risk-critical">{error}</p>}

          <form action={handleSignup} className="mt-6 space-y-4">
            <div>
              <label htmlFor="username" className="block text-xs text-ink-200">
                Username <span className="text-ink-400">(required)</span>
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                minLength={3}
                maxLength={32}
                autoComplete="username"
                className="mt-1.5 w-full border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-ink-100 outline-none focus-visible:border-accent-500"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-xs text-ink-200">
                Password <span className="text-ink-400">(required, 8+ characters)</span>
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className="mt-1.5 w-full border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-ink-100 outline-none focus-visible:border-accent-500"
              />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="block text-xs text-ink-200">
                Confirm password <span className="text-ink-400">(required)</span>
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className="mt-1.5 w-full border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-ink-100 outline-none focus-visible:border-accent-500"
              />
            </div>

            <div className="border-t border-ink-700 pt-4">
              <p className="text-xs text-ink-400">Optional</p>
              <div className="mt-3 space-y-4">
                <div>
                  <label htmlFor="displayName" className="block text-xs text-ink-200">
                    Display name
                  </label>
                  <input
                    id="displayName"
                    name="displayName"
                    type="text"
                    autoComplete="name"
                    className="mt-1.5 w-full border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-ink-100 outline-none focus-visible:border-accent-500"
                  />
                </div>
                <div>
                  <label htmlFor="email" className="block text-xs text-ink-200">
                    Email
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    className="mt-1.5 w-full border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-ink-100 outline-none focus-visible:border-accent-500"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-accent-500 py-2 text-sm font-medium text-ink-100 transition-colors hover:bg-accent-600"
            >
              Create account
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-ink-200">
            Already have an account? <Link href="/login" className="text-accent-300 hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
