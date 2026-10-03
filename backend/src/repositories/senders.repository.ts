import { and, asc, count, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { senders, type NewSender, type Sender } from '../db/schema';

export const sendersRepository = {
  async listByUser(userId: string): Promise<Sender[]> {
    return db.select().from(senders).where(eq(senders.userId, userId)).orderBy(asc(senders.createdAt));
  },

  async findForUser(id: string, userId: string): Promise<Sender | undefined> {
    const [sender] = await db
      .select()
      .from(senders)
      .where(and(eq(senders.id, id), eq(senders.userId, userId)));
    return sender;
  },

  async countByUser(userId: string): Promise<number> {
    const [row] = await db.select({ value: count() }).from(senders).where(eq(senders.userId, userId));
    return row?.value ?? 0;
  },

  async create(values: NewSender): Promise<Sender> {
    const [sender] = await db.insert(senders).values(values).returning();
    return sender!;
  },
};
