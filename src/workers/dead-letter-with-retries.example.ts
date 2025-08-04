import connectRabbitMQ from "@/lib/rabbitmq";
import { Channel, Connection } from "amqplib";

export default class DeadLetterWorker {
	channel!: Channel;
	connection!: Connection;
	constructor() {
		this.connection = null!;
		this.channel = null!;
	}

	async #init() {
		const { connection, channel } = await connectRabbitMQ();
		this.connection = connection;
		this.channel = channel;

		// dead letter variables
		let deadLetterQueue = "dead-letter-queue";
		let deadLetterExchange = "dead-letter-exchange";
		let deadLetterRoutingKey = "dead-letter-routing-key";
		// retry variables
		let retryQueue = "retry-queue";
		let retryRoutingKey = "retry-routing-key";

		// setup dead letter exchange
		await this.channel.assertExchange(deadLetterExchange, "direct", {
			durable: true
		});
		await this.channel.assertQueue(deadLetterQueue, { durable: true });
		await this.channel.bindQueue(
			deadLetterQueue,
			deadLetterExchange,
			deadLetterRoutingKey
		);

		// setup main queue
		let mainQueue = "main-queue";
		await this.channel.assertQueue(mainQueue, {
			durable: true,
			arguments: {
				"x-dead-letter-exchange": deadLetterExchange,
				"x-dead-letter-routing-key": retryRoutingKey
			}
		});

		// setup retry queue
		await this.channel.assertQueue(retryQueue, {
			durable: true,
			arguments: {
				"x-dead-letter-exchange": "",
				"x-dead-letter-routing-key": mainQueue,
				"x-message-ttl": 5000 // 5 seconds delay
			}
		});

		await this.channel.bindQueue(
			retryQueue,
			deadLetterExchange,
			retryRoutingKey
		); // bind retry queue to dead letter exchange

		// Setup consumer for dead-letter-queue to see failed messages
		await this.channel.consume(deadLetterQueue, (msg) => {
			if (msg) {
				console.log(
					"⚠️ Message in dead letter queue:",
					msg.content.toString()
				);
				console.log("Headers:", msg.properties.headers);
				this.channel.ack(msg); // Acknowledge to remove from DLQ
			}
		});
	}

	// send message to main queue
	async sendMessage(message: string) {
		await this.channel.sendToQueue("main-queue", Buffer.from(message));
	}

	// consumer main queue
	async #consumer_main() {
		await this.channel.consume("main-queue", (msg) => {
			if (msg) {
				try {
					console.log(
						"Received message from main queue:",
						msg.content.toString()
					);

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
						this.channel.sendToQueue("dead-letter-queue", msg.content, {
							headers: {
								"x-retry-count": retryCount,
								"x-error": error.message
							}
						});
						// Acknowledge the original message
						this.channel.ack(msg);
						return;
					}

					// Send to retry queue
					console.log("🔄 Sending to retry queue, attempt", retryCount);
					this.channel.sendToQueue("retry-queue", msg.content, {
						headers: {
							"x-retry-count": retryCount,
							"x-original-error": error.message
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

	// send message to main queue
	async sendMessageToMain(message: string) {
		await this.channel.sendToQueue("main-queue", Buffer.from(message));
	}

	// We've removed the retry queue consumer as discussed

	static async start() {
		const worker = new DeadLetterWorker();
		await worker.#init();
		await worker.#consumer_main();
		await worker.sendMessageToMain("Hello, World!");
	}
}
