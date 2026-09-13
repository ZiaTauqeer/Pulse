import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl, error } = await searchParams;

  async function authenticate(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        identifier: formData.get("identifier"),
        password: formData.get("password"),
        redirectTo: callbackUrl ?? "/overview",
      });
    } catch (err) {
      if (err instanceof AuthError) {
        redirect(`/login?error=invalid&callbackUrl=${encodeURIComponent(callbackUrl ?? "/overview")}`);
      }
      throw err;
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-900 px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="block text-center font-serif text-2xl text-ink-100">
          PULSE
        </Link>
        <div className="mt-8 border border-ink-700 bg-ink-800 p-8">
          <h1 className="font-serif text-xl text-ink-100">Sign in</h1>
          {error && (
            <p className="mt-3 text-sm text-risk-critical">
              That username/email and password combination wasn&apos;t recognized.
            </p>
          )}
          <form action={authenticate} className="mt-6 space-y-4">
            <div>
              <label htmlFor="identifier" className="block text-xs text-ink-200">
                Username or email
              </label>
              <input
                id="identifier"
                name="identifier"
                type="text"
                required
                autoComplete="username"
                className="mt-1.5 w-full border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-ink-100 outline-none focus-visible:border-accent-500"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-xs text-ink-200">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="mt-1.5 w-full border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-ink-100 outline-none focus-visible:border-accent-500"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-accent-500 py-2 text-sm font-medium text-ink-100 transition-colors hover:bg-accent-600"
            >
              Sign in
            </button>
          </form>
          <p className="mt-6 text-xs text-ink-400">
            Demo accounts (username / password): admin, analyst, csmanager, or viewer, all with
            password <code className="font-mono">pulse-demo-2026</code>.
          </p>
          <p className="mt-4 border-t border-ink-700 pt-4 text-center text-sm text-ink-200">
            No account? <Link href="/signup" className="text-accent-300 hover:underline">Sign up</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
