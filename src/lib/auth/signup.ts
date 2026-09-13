import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type SignupInput = {
  username: string;
  password: string;
  confirmPassword: string;
  displayName?: string;
  email?: string;
};

export type SignupResult =
  | { ok: true; userId: string }
  | { ok: false; error: string };

const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,32}$/;

export async function signupUser(input: SignupInput): Promise<SignupResult> {
  const username = input.username?.trim();
  const password = input.password ?? "";
  const confirmPassword = input.confirmPassword ?? "";
  const displayName = input.displayName?.trim();
  const email = input.email?.trim();

  if (!username || !password || !confirmPassword) {
    return { ok: false, error: "Username and password are required." };
  }
  if (!USERNAME_PATTERN.test(username)) {
    return { ok: false, error: "Username must be 3-32 characters: letters, numbers, underscores, or hyphens only." };
  }
  if (password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }
  if (password !== confirmPassword) {
    return { ok: false, error: "Passwords do not match." };
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "That doesn't look like a valid email address." };
  }

  const existingUsername = await prisma.user.findUnique({ where: { username } });
  if (existingUsername) {
    return { ok: false, error: "That username is already taken." };
  }
  if (email) {
    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail) {
      return { ok: false, error: "That email is already registered." };
    }
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // New signup -> new workspace -> user becomes its admin. Demo/seeded
  // data lives in a separate workspace (see prisma/seed.ts ORG_ID), so a
  // new user starts with an empty, private customer list rather than
  // seeing (or being able to modify) the shared demo data.
  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const organization = await tx.organization.create({
      data: { name: `${displayName || username}'s workspace` },
    });
    const user = await tx.user.create({
      data: {
        username,
        email: email || null,
        name: displayName || username,
        passwordHash,
        role: "ADMIN",
        organizationId: organization.id,
      },
    });
    return user;
  });

  return { ok: true, userId: result.id };
}
