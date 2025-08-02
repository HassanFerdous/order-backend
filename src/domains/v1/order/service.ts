import { db } from "@/config/db";
import { ordersTable } from "@/db/order";
import { eq, InferInsertModel, InferSelectModel } from "drizzle-orm";

export type Order = InferSelectModel<typeof ordersTable>;
export type NewOrder = InferInsertModel<typeof ordersTable>;

export const OrderServices = {
	create: async (data: NewOrder): Promise<Order> => {
		const [created] = await db.insert(ordersTable).values(data).returning();
		return created;
	},

	getById: async (id: number): Promise<Order | null> => {
		const result = await db
			.select()
			.from(ordersTable)
			.where(eq(ordersTable.id, id));
		return result[0] ?? null;
	},

	getAllByUserId: async (userId: number): Promise<Order[]> => {
		return db
			.select()
			.from(ordersTable)
			.where(eq(ordersTable.userId, userId));
	},

	getAll: async (): Promise<Order[]> => {
		return db.select().from(ordersTable);
	},

	update: async (id: number, data: NewOrder): Promise<Order | null> => {
		const [updated] = await db
			.update(ordersTable)
			.set(data)
			.where(eq(ordersTable.id, id))
			.returning();
		return updated ?? null;
	},

	delete: async (id: number): Promise<Order | null> => {
		const [deleted] = await db
			.delete(ordersTable)
			.where(eq(ordersTable.id, id))
			.returning();
		return deleted ?? null;
	}
};
