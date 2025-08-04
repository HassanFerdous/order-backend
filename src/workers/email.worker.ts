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

		// Setup Email Queue
		this.channel.assertExchange(
			workerConfig.email.exchange!,
			workerConfig.email.type,
			{ durable: true }
		);
		await this.channel.assertQueue(workerConfig.email.queue, {
			durable: true,
			arguments: {
				"x-dead-letter-exchange": workerConfig.dead_letter.exchange,
				"x-dead-letter-routing-key": workerConfig.retry.routingKey
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
		try {
			await this.channel.publish(
				workerConfig.email.exchange,
				`email.${jobType}`,
				Buffer.from(JSON.stringify({ jobType, ...data }))
			);
		} catch (error) {
			console.log(error);
		}
	}

	/**
	 * Consume the messages from the queue
	 */
	async #consumer() {
		if (!this.channel) await this.#init();
		await this.channel.consume(workerConfig.email.queue, (msg) => {
			if (msg) {
				try {
					// Check if this is a retry
					const headers = msg.properties.headers || {};
					const retryCount = headers["x-retry-count"] || 0;

					// For testing, always throw error unless it's the final retry
					// In a real app, you'd have your actual processing logic here
					if (retryCount < 3) {
						throw new Error("Simulated error");
					}

					// If we get here, processing succeeded
					console.log(
						"✅ Message processed successfully after",
						retryCount,
						"retries"
					);
					this.channel.ack(msg);
				} catch (error: any) {
					const headers = msg.properties.headers || {};
					// get retry count from headers
					let retryCount = headers["x-retry-count"] || 0;

					// increment retry count
					retryCount++;

					if (retryCount >= 3) {
						console.log(
							"❌ Max retries reached, sending to dead letter queue"
						);
						// Send to the actual dead letter queue, not the retry queue
						this.channel.sendToQueue(
							workerConfig.dead_letter.queue,
							msg.content,
							{
								headers: {
									"x-retry-count": retryCount,
									"x-error": error.message
								}
							}
						);
						// Acknowledge the original message
						this.channel.ack(msg);
						return;
					}

					// Send to retry queue
					console.log("🔄 Sending to retry queue, attempt", retryCount);
					this.channel.sendToQueue(workerConfig.retry.queue, msg.content, {
						headers: {
							"x-retry-count": retryCount,
							"x-original-error": error.message
							// "x-original-exchange": workerConfig.email.exchange,
							// "x-original-routing-key": workerConfig.email.routingKey
						}
					});

					// IMPORTANT: Acknowledge the message from the main queue
					// This prevents the message from being redelivered to the main queue
					// and allows the retry mechanism to work
					this.channel.ack(msg);
				}
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
				console.log("Unknown job type:", jobType);
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
