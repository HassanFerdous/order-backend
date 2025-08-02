import { idParamSchema } from "@/lib/common-zod-schema";
import { z } from "zod";

// Order status enum
const orderStatusEnum = z.enum([
	"pending",
	"processing",
	"shipped",
	"delivered",
	"cancelled"
]);

// Payment status options
const paymentStatusEnum = z.enum(["paid", "unpaid", "failed"]);

// Schema for creating a new order
export const createOrderSchema = z.object({
	productId: z
		.number()
		.int()
		.positive("Product ID must be a positive integer"),
	quantity: z.number().int().positive("Quantity must be a positive integer"),
	totalPrice: z.number().positive("Total price must be a positive number"),
	shippingAddress: z
		.string()
		.min(1, "Shipping address is required")
		.max(500, "Shipping address is too long"),
	paymentMethod: z
		.string()
		.max(50, "Payment method is too long")
		.default("cash"),
	paymentStatus: z
		.string()
		.max(50, "Payment status is too long")
		.default("unpaid"),
	notes: z.string().max(1000, "Notes are too long").optional()
});

// Schema for updating an order
export const updateOrderSchema = z.object({
	productId: z.number().int().positive().optional(),
	quantity: z.number().int().positive().optional(),
	totalPrice: z.number().positive().optional(),
	status: orderStatusEnum.optional(),
	shippingAddress: z.string().min(1).max(500).optional(),
	trackingNumber: z.string().max(100).optional(),
	paymentMethod: z.string().max(50).optional(),
	paymentStatus: z.string().max(50).optional(),
	deliveryDate: z.date().optional().nullable(),
	notes: z.string().optional()
});

// Schema for updating order status
export const updateOrderStatusSchema = z.object({
	status: orderStatusEnum
});

// Schema for updating tracking information
export const updateTrackingSchema = z.object({
	trackingNumber: z
		.string()
		.min(1, "Tracking number is required")
		.max(100, "Tracking number is too long"),
	status: z.literal("shipped")
});

// Schema for updating payment information
export const updatePaymentSchema = z.object({
	paymentMethod: z
		.string()
		.min(1, "Payment method is required")
		.max(50, "Payment method is too long"),
	paymentStatus: paymentStatusEnum
});

// Schema for filtering orders
export const orderFilterSchema = z.object({
	userId: z.number().int().positive().optional(),
	status: orderStatusEnum.optional(),
	paymentStatus: z.string().optional(),
	fromDate: z.date().optional(),
	toDate: z.date().optional(),
	minPrice: z.number().positive().optional(),
	maxPrice: z.number().positive().optional()
});

// Schema for order ID parameter
export const orderIdParamSchema = z.object({
	id: idParamSchema
});

// {
//   "userId": 1,
//   "productId": 123,
//   "quantity": 2,
//   "totalPrice": 99.99,
//   "shippingAddress": "123 Main Street, Apt 4B, New York, NY 10001",
//   "paymentMethod": "credit_card",
//   "paymentStatus": "unpaid",
//   "notes": "Please deliver after 6pm"
// }

// {
//   "quantity": 3,
//   "totalPrice": 149.99,
//   "status": "processing",
//   "shippingAddress": "456 Park Avenue, Suite 789, New York, NY 10022",
//   "paymentMethod": "paypal"
// }
