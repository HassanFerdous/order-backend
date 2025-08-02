import workerConfig from "@/config/worker-config";
import { NewOrder, Order, OrderServices } from "@/domains/v1/order/service";
import connectRabbitMQ from "@/lib/rabbitmq";
import { ConsumeMessage } from "amqplib";
import EmailWorker, { EmailJobType } from "./email.worker";
import { EmailPayload } from "..";
import { User } from "@/domains/v1/user/service";

// Order job type
export type OrderJob =
	| "confirmed-order"
	| "update"
	| "delete"
	| "cancel"
	| "ship"
	| "deliver";

export default class OrderWorker {
	connection: any;
	channel: any;
	constructor() {
		this.connection = null;
		this.channel = null;
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
		// 2. Assert the queue
		await this.channel.assertQueue(workerConfig.order.queue, {
			durable: true
		});

		// 3. Bind the queue to the exchange using routing key
		await this.channel.bindQueue(
			workerConfig.order.queue,
			workerConfig.order.exchange,
			workerConfig.order.routingKey
		);
		console.log("📨 OrderWorker initialized");
	}

	async send(jobType: OrderJob, data: Order & { user: User }) {
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
					};
					console.log("📧 Received order from Queue");
					await this.#handleJob(data.jobType, data);
					this.channel.ack(msg);
				}
			}
		);
	}

	async #handleJob(jobType: OrderJob, data: Order) {
		switch (jobType) {
			case "confirmed-order":
				// Create order
				await this.#confirmedOrder(data);
				break;
			case "update":
				// Update order
				break;
			case "delete":
				// Delete order
				break;
			case "cancel":
				// Cancel order
				break;
			case "ship":
				// Ship order
				break;
			case "deliver":
				// Deliver order
				break;
		}
	}

	async #confirmedOrder(order: any) {
		await this.#sendEmail("confirmed-order", {
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

	async #sendEmail(jobType: OrderJob, data: EmailPayload) {
		const emailWorker = new EmailWorker();
		await emailWorker.send(jobType as EmailJobType, data);
	}

	static start() {
		const orderWorker = new OrderWorker();
		orderWorker.#init();
		orderWorker.#consumer();
		console.log("🚀 Order worker started");
	}
}
