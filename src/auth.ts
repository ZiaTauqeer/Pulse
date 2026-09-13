import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

/**
 * JWT sessions, not database sessions - see the note at the top of
 * prisma/schema.prisma for why there's no Session/Account model. If you
 * add an OAuth provider later, you'll want to switch to the Prisma
 * adapter and database sessions; Credentials-only auth doesn't support
 * database sessions in Auth.js, so this is the correct default here.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        identifier: { label: "Username or email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const identifier = typeof credentials?.identifier === "string" ? credentials.identifier.trim() : undefined;
        const password = typeof credentials?.password === "string" ? credentials.password : undefined;
        if (!identifier || !password) return null;

        const user = await prisma.user.findFirst({
          where: { OR: [{ username: identifier }, { email: identifier }] },
        });
        if (!user) return null;

        const validPassword = await bcrypt.compare(password, user.passwordHash);
        if (!validPassword) return null;

        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          organizationId: user.organizationId,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role;
        token.organizationId = user.organizationId;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as "ADMIN" | "ANALYST" | "CS_MANAGER" | "VIEWER";
      session.user.organizationId = token.organizationId as string;
      return session;
    },
  },
});
