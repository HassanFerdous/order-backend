import {
	date,
	decimal,
	integer,
	pgEnum,
	pgTable,
	text,
	varchar
} from "drizzle-orm/pg-core";
import { timestampColumns } from "./common";
import { usersTable } from "./schema";

export const orderStatusEnum = pgEnum("status", [
	"pending",
	"processing",
	"shipped",
	"delivered",
	"cancelled"
]);

export const ordersTable = pgTable("orders", {
	id: integer().primaryKey().generatedAlwaysAsIdentity(),
	userId: integer()
		.notNull()
		.references(() => usersTable.id),
	productId: integer().notNull(),
	quantity: integer().notNull(),
	totalPrice: decimal().notNull(),

	// Order status: pending, processing, shipped, delivered, cancelled, etc.
	status: orderStatusEnum().default("pending"),

	shippingAddress: varchar({ length: 500 }).notNull(),
	trackingNumber: varchar({ length: 100 }), // For shipped orders
	paymentMethod: varchar({ length: 50 }).default("cash"), // e.g., cash, card, PayPal
	paymentStatus: varchar({ length: 50 }).default("unpaid"), // paid, unpaid, failed
	deliveryDate: date(), // when it was delivered
	notes: text(), // extra info added by customer/admin

	...timestampColumns
});
