import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { slackConnections, type SlackConnection } from '../db/schema';

export type SlackConnectionInput = Omit<SlackConnection, 'id' | 'createdAt' | 'updatedAt'>;

export const slackRepository = {
  async findByUser(userId: string): Promise<SlackConnection | undefined> {
    const [connection] = await db.select().from(slackConnections).where(eq(slackConnections.userId, userId));
    return connection;
  },

  // one connection per user, reconnecting replaces it
  async upsert(input: SlackConnectionInput): Promise<SlackConnection> {
    const { userId, ...values } = input;
    const [connection] = await db
      .insert(slackConnections)
      .values(input)
      .onConflictDoUpdate({ target: slackConnections.userId, set: { ...values, updatedAt: new Date() } })
      .returning();
    return connection!;
  },

  async deleteByUser(userId: string): Promise<SlackConnection | undefined> {
    const [connection] = await db.delete(slackConnections).where(eq(slackConnections.userId, userId)).returning();
    return connection;
  },
};
