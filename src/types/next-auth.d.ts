import type { DefaultSession } from "next-auth";

// Extends Auth.js's built-in types with the fields PULSE actually needs on
// every request: which organization a user belongs to (for data scoping)
// and their RBAC role (see prisma/schema.prisma Role enum).
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "ADMIN" | "ANALYST" | "CS_MANAGER" | "VIEWER";
      organizationId: string;
    } & DefaultSession["user"];
  }

  interface User {
    role: "ADMIN" | "ANALYST" | "CS_MANAGER" | "VIEWER";
    organizationId: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "ADMIN" | "ANALYST" | "CS_MANAGER" | "VIEWER";
    organizationId: string;
  }
}
