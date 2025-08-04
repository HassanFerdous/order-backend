import connectRabbitMQ from "@/lib/rabbitmq";
import { Channel, Connection } from "amqplib";

interface WorkerConfig {
	queue: string;
	exchangeName?: string; // e.g. 'emails.exchange'
	exchangeType?: "direct" | "topic" | "fanout" | "headers";
	routingKey?: string; // used when publishing
	durable?: boolean;
	exclusive?: boolean;
	enableRetry?: boolean;
	enableDLQ?: boolean;
	maxRetries?: number;
	onReceive?: (message: string, channel: Channel) => Promise<void>;
	retryTtl?: number;
	onInit?: (channel: Channel) => Promise<void>;
	initialize?: boolean;
	enableLogger?: boolean;
}

const defaultConfig = {
	exchangeType: "direct" as "direct" | "topic" | "fanout" | "headers",
	routingKey: "",
	exchangeName: "",
	enableRetry: false,
	enableDLQ: false,
	maxRetries: 3,
	durable: true,
	exclusive: false,
	retryTtl: 5000, // 5 minutes
	initialize: true,
	enableLogger: false
};

export default class BaseWorker {
	#connection!: Connection;
	#channel!: Channel;
	#config: WorkerConfig;
	dlx!: string;
	dlq!: string;
	retryQueue!: string;

	constructor(config: WorkerConfig) {
		this.#config = {
			...defaultConfig,
			...config
		};
		this.#connection = null!;
		this.#channel = null!;
		this.dlx = null!;
		this.dlq = null!;
		this.retryQueue = null!;
	}

	async init() {
		if (!this.#config.initialize) return;
		console.log(`Initializing ${this.#config.queue} worker`);
		await this.#setup();
		await this.#consumer();
		await this.#dlqConsumer();
	}

	async #assertMainQueue() {
		const options = {
			durable: this.#config.durable,
			exclusive: this.#config.exclusive,
			arguments: this.#config.enableRetry
				? {
						"x-dead-letter-exchange": "",
						"x-dead-letter-routing-key": this.retryQueue
				  }
				: {}
		};
		await this.#channel.assertQueue(this.#config.queue, options);
		if (this.#config.exchangeName) {
			await this.#channel.assertExchange(
				this.#config.exchangeName!,
				this.#config.exchangeType!,
				options
			);
			await this.#channel.bindQueue(
				this.#config.queue,
				this.#config.exchangeName!,
				this.#config.routingKey!
			);
		}
	}

	async #assertDLQRetry() {
		// setup dead letter queue and exchange
		if (this.#config.enableDLQ) {
			await this.#channel.assertExchange(this.dlx, "direct", {
				durable: true
			});
			await this.#channel.assertQueue(this.dlq, {
				durable: true
			});
			await this.#channel.bindQueue(this.dlq, this.dlx, "");
		}

		// setup retry queue and bind dlq exchange with retry queue
		if (this.#config.enableRetry) {
			await this.#channel.assertQueue(this.retryQueue, {
				durable: true,
				arguments: {
					"x-message-ttl": Math.max(this.#config.retryTtl ?? 5000, 1000),
					"x-dead-letter-exchange": this.#config.exchangeName
						? this.#config.exchangeName
						: "",
					"x-dead-letter-routing-key": this.#config.routingKey
						? this.#config.routingKey
						: this.#config.queue
				}
			});
		}
	}

	async #setup() {
		const { channel, connection } = await connectRabbitMQ();
		this.#connection = connection;
		this.#channel = channel;

		this.dlx = `${this.#config.queue}.dlx`;
		this.dlq = `${this.#config.queue}.dlq`;
		this.retryQueue = `${this.#config.queue}.retry`;

		//Setup main queue
		await this.#assertMainQueue();

		//Setup DLQ and Retry
		await this.#assertDLQRetry();

		//Setup custom init
		await this.#config.onInit?.(this.#channel);
	}

	async send(callback: (channel: Channel) => Promise<void>) {
		if (!this.#config.initialize) return;
		console.log("Sending message to", this.#config.queue);
		await callback(this.#channel);
	}

	async #consumer() {
		await this.#channel.consume(this.#config.queue, async (msg) => {
			if (!msg) return null;
			// Check if this is a retry
			const headers = msg.properties.headers || {};
			let retryCount = headers["x-retry-count"] || 0;
			if (this.#config.enableLogger) {
				console.log("Received message from", msg.content.toString());
			} else {
				console.log("Received message from", this.#config.queue);
			}
			try {
				await this.#config.onReceive?.(
					msg.content.toString(),
					this.#channel
				);
				this.#channel.ack(msg);
			} catch (error: any) {
				// increment retry count
				retryCount++;

				if (retryCount >= this.#config.maxRetries!) {
					console.log("Max retries reached, sending to DLQ");
					// Send to the DLQ
					this.#channel.sendToQueue(this.dlq, msg.content, {
						headers: {
							"x-retry-count": retryCount,
							"x-error": error.message
						}
					});
					// Acknowledge the original message
					this.#channel.ack(msg);
					return;
				}
				// Send to retry queue
				console.log("🔄 Sending to retry queue, attempt", retryCount);
				this.#channel.sendToQueue(this.retryQueue, msg.content, {
					headers: {
						"x-retry-count": retryCount,
						"x-original-error": error.message,
						"x-original-exchange": this.#config.queue,
						"x-original-routing-key": ""
					}
				});

				// IMPORTANT: Acknowledge the message from the main queue
				this.#channel.ack(msg);
			}
		});
	}

	// DLQ consumer
	async #dlqConsumer() {
		await this.#channel.consume(this.dlq, async (msg) => {
			if (!msg) return null;
			// Check if this is a retry
			const headers = msg.properties.headers || {};
			let retryCount = headers["x-retry-count"] || 0;
			console.log("DLQ message received, retry count:", retryCount);
			console.log("DLQ message content:", msg.content.toString());
			this.#channel.ack(msg);
		});
	}
}
