import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { users, type User } from '../db/schema';

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export const usersRepository = {
  async upsertFromGoogle(profile: GoogleProfile): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(profile)
      .onConflictDoUpdate({
        target: users.googleId,
        set: { email: profile.email, name: profile.name, avatarUrl: profile.avatarUrl, updatedAt: new Date() },
      })
      .returning();
    return user!;
  },

  async findById(id: string): Promise<User | undefined> {
    return db.query.users.findFirst({ where: eq(users.id, id) });
  },

  async findByEmail(email: string): Promise<User | undefined> {
    return db.query.users.findFirst({ where: eq(sql`lower(${users.email})`, email.toLowerCase()) });
  },
};
