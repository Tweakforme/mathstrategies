import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

// Hardcoded users — no DB needed for auth
const USERS = [
  { id: "1", username: "me",      password: "ufc2024", name: "Me" },
  { id: "2", username: "brother", password: "ufc2024", name: "Brother" },
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const user = USERS.find(
          (u) =>
            u.username === credentials?.username &&
            u.password === credentials?.password
        );
        if (!user) return null;
        return { id: user.id, name: user.name, email: user.username };
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 }, // 30 days
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user) session.user.id = token.id as string;
      return session;
    },
  },
});
