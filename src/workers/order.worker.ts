import workerConfig from "@/config/worker-config";
import { Order } from "@/domains/v1/order/service";
import { User } from "@/domains/v1/user/service";
import { sendEmail } from "@/lib/mailer";
import { ExchangeType } from "..";
import BaseWorker from "./base-worker";

// Order job type
export type OrderJob =
	| "created"
	| "update"
	| "delete"
	| "cancel"
	| "ship"
	| "deliver";

type OrderWithUser = Order & { user: User };

const OrderJobs = {
	confirmedOrder: async (order: OrderWithUser) => {
		await sendEmail({
			subject: "🎉 Order Confirmation",
			to: order?.user?.email, // or user's email from your system
			html: `
			<div style="font-family: Arial, sans-serif; color: #333; padding: 20px;">
				<h2 style="color: #4CAF50;">Order Confirmation</h2>
				<p>Hello ${order?.user?.name || "Valued Customer"},</p>
				<p>Thank you for your order! We're pleased to confirm that your order has been received and is being processed.</p>
				
				<div style="background: #f4f4f4; padding: 15px; border-radius: 5px; margin: 20px 0;">
				<h3 style="margin-top: 0; color: #333;">Order Details</h3>
				<p><strong>Order ID:</strong> #${order.id}</p>
				<p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
				<p><strong>Total Amount:</strong> $${order.totalPrice}</p>
				<p><strong>Payment Method:</strong> ${order.paymentMethod}</p>
				<p><strong>Shipping Address:</strong> ${order.shippingAddress}</p>
				</div>
				
				<p>Your order is currently <strong>${
					order.status
				}</strong>. We'll send you another email when your order ships with tracking information.</p>
				
				<p>If you have any questions about your order, please contact our customer service team.</p>
				
				<hr style="margin-top: 30px;" />
				<p style="font-size: 12px; color: #888;">Thank you for shopping with us!<br />The YourApp Team</p>
			</div>
		`
		});
	}
};

const jobHandler = async (jobType: OrderJob, data: OrderWithUser) => {
	switch (jobType) {
		case "created":
			// Create order
			await OrderJobs.confirmedOrder(data);
			break;
		default:
			console.log("Unknown job type:", jobType);
			break;
	}
};

const orderWorker = new BaseWorker({
	queue: workerConfig.order.queue,
	exchange: workerConfig.order.exchange,
	routingKey: workerConfig.order.routingKey,
	exchangeType: workerConfig.order.type as ExchangeType,
	enableDLQ: true,
	onReceive: async (message, channel) => {
		const data = JSON.parse(message.content.toString());
		const { jobType, data: orderData } = data;
		await jobHandler(jobType, orderData as OrderWithUser);
		channel.ack(message);
	},
	durable: true
});

export default orderWorker;
