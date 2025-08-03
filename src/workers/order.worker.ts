import workerConfig from "@/config/worker-config";
import { Order } from "@/domains/v1/order/service";
import { User } from "@/domains/v1/user/service";
import { sendEmail } from "@/lib/mailer";
import connectRabbitMQ from "@/lib/rabbitmq";
import { Channel, Connection, ConsumeMessage } from "amqplib";
import { EmailPayload } from "..";

// Order job type
export type OrderJob =
	| "created"
	| "update"
	| "delete"
	| "cancel"
	| "ship"
	| "deliver";

type OrderWithUser = Order & { user: User };

export default class OrderWorker {
	connection!: Connection;
	channel!: Channel;
	constructor() {
		this.connection = null!;
		this.channel = null!;
	}
	async #init() {
		const { connection, channel } = await connectRabbitMQ();
		this.connection = connection;
		this.channel = channel;
		this.channel.assertExchange(
			workerConfig.order.exchange,
			workerConfig.order.type,
			{ durable: true }
		);
		//Assert the queue
		await this.channel.assertQueue(workerConfig.order.queue, {
			durable: true
		});

		//Bind the queue to the exchange using routing key
		await this.channel.bindQueue(
			workerConfig.order.queue,
			workerConfig.order.exchange,
			workerConfig.order.routingKey
		);
		console.log("📨 OrderWorker initialized");
	}

	async send(jobType: OrderJob, data: OrderWithUser) {
		if (!this.channel) await this.#init();
		await this.channel.publish(
			workerConfig.order.exchange,
			`order.${jobType}`,
			Buffer.from(JSON.stringify({ jobType, ...data }))
		);
	}

	async #consumer() {
		if (!this.channel) await this.#init();
		this.channel.consume(
			workerConfig.order.queue,
			async (msg: ConsumeMessage | null) => {
				if (msg) {
					const data = JSON.parse(msg.content.toString()) as Order & {
						jobType: OrderJob;
						user: User;
					};
					console.log("📧 Received order from Queue");
					await this.#handleJob(data.jobType, data);
					this.channel.ack(msg);
				}
			}
		);
	}

	async #handleJob(jobType: OrderJob, data: OrderWithUser) {
		switch (jobType) {
			case "created":
				// Create order
				await this.#confirmedOrder(data);
				break;
			case "update":
				// Update order - send status update emails
				await this.#sendStatusUpdateEmail(data);
				break;
			case "delete":
				// Delete order
				break;
			case "cancel":
				// Cancel order
				await this.#sendCancellationEmail(data);
				break;
			case "ship":
				// Ship order
				await this.#sendShippingEmail(data);
				break;
			case "deliver":
				// Deliver order
				await this.#sendDeliveryEmail(data);
				break;
		}
	}

	// Add these methods to handle different email types
	async #sendStatusUpdateEmail(data: OrderWithUser) {
		// Choose email template based on order status
		switch (data.status) {
			case "processing":
				await this.#sendProcessingEmail(data);
				break;
			case "shipped":
				await this.#sendShippingEmail(data);
				break;
			case "delivered":
				await this.#sendDeliveryEmail(data);
				break;
			case "cancelled":
				await this.#sendCancellationEmail(data);
				break;
		}
	}

	async #confirmedOrder(order: OrderWithUser) {
		await this.#sendEmail({
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

	async #sendProcessingEmail(order: OrderWithUser) {
		await this.#sendEmail({
			subject: "🔄 Your Order is Being Processed",
			to: order?.user?.email,
			html: `
			<div style="font-family: Arial, sans-serif; color: #333; padding: 20px;">
				<h2 style="color: #3498db;">Order Processing Update</h2>
				<p>Hello ${order?.user?.name || "Valued Customer"},</p>
				<p>Good news! We've started processing your order and are preparing it for shipment.</p>
				
				<div style="background: #f4f4f4; padding: 15px; border-radius: 5px; margin: 20px 0;">
				<h3 style="margin-top: 0; color: #333;">Order Details</h3>
				<p><strong>Order ID:</strong> #${order.id}</p>
				<p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
				<p><strong>Total Amount:</strong> $${order.totalPrice}</p>
				</div>
				
				<p>We're working hard to get your items ready. You'll receive another email with tracking information once your order ships.</p>
				
				<p>If you have any questions about your order, please contact our customer service team.</p>
				
				<hr style="margin-top: 30px;" />
				<p style="font-size: 12px; color: #888;">Thank you for your patience!<br />The YourApp Team</p>
			</div>
		`
		});
	}

	async #sendShippingEmail(order: OrderWithUser) {
		await this.#sendEmail({
			subject: "🚚 Your Order Has Shipped",
			to: order?.user?.email,
			html: `
			<div style="font-family: Arial, sans-serif; color: #333; padding: 20px;">
				<h2 style="color: #2980b9;">Your Order is on the Way!</h2>
				<p>Hello ${order?.user?.name || "Valued Customer"},</p>
				<p>Great news! Your order has been shipped and is on its way to you.</p>
				
				<div style="background: #f4f4f4; padding: 15px; border-radius: 5px; margin: 20px 0;">
				<h3 style="margin-top: 0; color: #333;">Shipping Details</h3>
				<p><strong>Order ID:</strong> #${order.id}</p>
				<p><strong>Tracking Number:</strong> ${
					order.trackingNumber || "Not available"
				}</p>
				<p><strong>Shipping Address:</strong> ${order.shippingAddress}</p>
				</div>
				
				<p>You can track your package using the tracking number above. Please allow 24 hours for tracking information to become active.</p>
				
				<p>If you have any questions about your shipment, please contact our customer service team.</p>
				
				<hr style="margin-top: 30px;" />
				<p style="font-size: 12px; color: #888;">We hope you enjoy your purchase!<br />The YourApp Team</p>
			</div>
		`
		});
	}

	async #sendDeliveryEmail(order: OrderWithUser) {
		await this.#sendEmail({
			subject: "📦 Your Order Has Been Delivered",
			to: order?.user?.email,
			html: `
			<div style="font-family: Arial, sans-serif; color: #333; padding: 20px;">
				<h2 style="color: #27ae60;">Order Delivered Successfully</h2>
				<p>Hello ${order?.user?.name || "Valued Customer"},</p>
				<p>Your order has been delivered! We hope everything arrived in perfect condition.</p>
				
				<div style="background: #f4f4f4; padding: 15px; border-radius: 5px; margin: 20px 0;">
				<h3 style="margin-top: 0; color: #333;">Order Details</h3>
				<p><strong>Order ID:</strong> #${order.id}</p>
				<p><strong>Delivery Date:</strong> ${
					order.deliveryDate
						? new Date(order.deliveryDate).toLocaleDateString()
						: new Date().toLocaleDateString()
				}</p>
				<p><strong>Delivery Address:</strong> ${order.shippingAddress}</p>
				</div>
				
				<p>If you have any issues with your order or would like to provide feedback, please don't hesitate to contact us.</p>
				
				<hr style="margin-top: 30px;" />
				<p style="font-size: 12px; color: #888;">Thank you for shopping with us!<br />The YourApp Team</p>
			</div>
		`
		});
	}

	async #sendCancellationEmail(order: OrderWithUser) {
		await this.#sendEmail({
			subject: "❌ Your Order Has Been Cancelled",
			to: order?.user?.email,
			html: `
			<div style="font-family: Arial, sans-serif; color: #333; padding: 20px;">
				<h2 style="color: #e74c3c;">Order Cancellation Confirmation</h2>
				<p>Hello ${order?.user?.name || "Valued Customer"},</p>
				<p>We're confirming that your order has been cancelled as requested.</p>
				
				<div style="background: #f4f4f4; padding: 15px; border-radius: 5px; margin: 20px 0;">
				<h3 style="margin-top: 0; color: #333;">Cancelled Order Details</h3>
				<p><strong>Order ID:</strong> #${order.id}</p>
				<p><strong>Cancellation Date:</strong> ${new Date().toLocaleDateString()}</p>
				</div>
				
				<p>If you were charged for this order, a refund will be processed according to our refund policy. Please allow 5-7 business days for the refund to appear in your account.</p>
				
				<p>If you didn't request this cancellation or have any questions, please contact our customer service team immediately.</p>
				
				<hr style="margin-top: 30px;" />
				<p style="font-size: 12px; color: #888;">We hope to serve you again soon!<br />The YourApp Team</p>
			</div>
		`
		});
	}

	async #sendEmail(data: EmailPayload) {
		await sendEmail(data);
	}

	static start() {
		const orderWorker = new OrderWorker();
		orderWorker.#init();
		orderWorker.#consumer();
		console.log("🚀 Order worker started");
	}
}
