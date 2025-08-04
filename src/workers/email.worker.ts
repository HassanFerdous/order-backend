import workerConfig from "@/config/worker-config";
import connectRabbitMQ from "@/lib/rabbitmq";
import { Channel, Connection, ConsumeMessage } from "amqplib";
import { EmailPayload } from "..";
import { sendEmail } from "@/lib/mailer";

export type EmailJobType = "send-otp";
type EmailPayloadWithJobType = EmailPayload & {
	jobType: EmailJobType;
};
export default class EmailWorker {
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

		// Setup Dead Letter Exchange
		await this.channel.assertExchange("dlx", "direct", {
			durable: true
		});
		await this.channel.assertQueue("dead_letter_queue", {
			durable: true
		});
		await channel.bindQueue("dead_letter_queue", "dlx", "dead_letter");

		// Setup Email Queue
		this.channel.assertExchange(
			workerConfig.email.exchange,
			workerConfig.email.type,
			{ durable: true }
		);
		await this.channel.assertQueue(workerConfig.email.queue, {
			durable: true,
			arguments: {
				"x-dead-letter-exchange": "dlx",
				"x-dead-letter-routing-key": "dead_letter"
			}
		});
		await this.channel.bindQueue(
			workerConfig.email.queue,
			workerConfig.email.exchange,
			workerConfig.email.routingKey
		);

		console.log("📨 EmailWorker initialized");
	}

	/**
	 * Send email
	 */
	async send(jobType: EmailJobType, data: EmailPayload) {
		if (!this.channel) await this.#init();
		await this.channel.publish(
			workerConfig.email.exchange,
			`email.${jobType}`,
			Buffer.from(JSON.stringify({ jobType, ...data }))
		);
	}

	/**
	 * Consume the messages from the queue
	 */
	async #consumer() {
		if (!this.channel) await this.#init();
		this.channel.consume(
			workerConfig.email.queue,
			async (msg: ConsumeMessage | null) => {
				if (!msg) return;
				const data = JSON.parse(
					msg.content.toString()
				) as EmailPayloadWithJobType;
				try {
					if (Math.random() > 0.4)
						throw new Error("Failure Simulation error");
					await this.#handleJob(data.jobType, data);
					console.log("Email sent successfully");
					this.channel.ack(msg);
				} catch (error) {
					const headers = msg.properties.headers || {};
					let retries = parseInt(headers["x-retry-count"] || "0");

					if (retries >= workerConfig.email.maxRetries) {
						console.log(
							`Max retries exceeded. Sending to DLQ for: ${data.to}`
						);
						this.channel.nack(msg, false, false); // Send to DLQ via dead-letter-exchange
					} else {
						retries++;
						console.log(`Retry ${retries} for email to: ${data.to}`);

						// Clone headers with updated retry count and original routing info
						const updatedHeaders = {
							...headers,
							"x-retry-count": retries,
							"x-original-exchange":
								headers["x-original-exchange"] ||
								workerConfig.email.exchange,
							"x-original-routing-key":
								headers["x-original-routing-key"] ||
								workerConfig.email.routingKey
						};

						// Manually ack to remove from current queue (retry will happen via new message)
						this.channel.ack(msg);

						// Re-publish to retry queue with updated headers
						this.channel.sendToQueue(
							workerConfig.retry.queue,
							msg.content,
							{
								headers: updatedHeaders,
								persistent: true
							}
						);
					}
				}
			}
		);

		await this.channel.consume("dead_letter_queue", (msg) => {
			if (msg !== null) {
				// Log the content of the dead-lettered message
				console.log(
					"Received dead-lettered message:",
					msg.content.toString()
				);
				// Acknowledge the message to remove it from the queue
				this.channel.ack(msg);
			}
		});
	}

	/**
	 * Send OTP email
	 */
	async #sendOTP(data: EmailPayload) {
		await sendEmail(data);
	}

	/**
	 * Handle the job
	 */
	async #handleJob(jobType: EmailJobType, data: EmailPayloadWithJobType) {
		switch (jobType) {
			case "send-otp":
				await this.#sendOTP(data);
				break;
			default:
				break;
		}
	}

	/**
	 * Start the worker
	 */
	static async start() {
		const worker = new EmailWorker();
		await worker.#init();
		await worker.#consumer();
	}
}
