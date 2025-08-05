import connectRabbitMQ from "@/lib/rabbitmq";
import { Channel, Connection, ConsumeMessage } from "amqplib";
import { ExchangeType } from "..";

interface WorkerConfig {
	queue: string;
	exchange?: string; // e.g. 'emails.exchange'
	exchangeType?: ExchangeType;
	routingKey?: string; // used when publishing
	durable?: boolean;
	exclusive?: boolean;
	enableRetry?: boolean;
	enableDLQ?: boolean;
	maxRetries?: number;
	onReceive?: (message: ConsumeMessage, channel: Channel) => Promise<void>;
	retryTtl?: number;
	onInit?: (channel: Channel) => Promise<void>;
}

const defaultConfig = {
	exchangeType: "direct" as ExchangeType,
	routingKey: "",
	exchange: "",
	enableRetry: false,
	enableDLQ: false,
	maxRetries: 3,
	durable: true,
	exclusive: false,
	retryTtl: 5000 // 5 minutes
};

export default class BaseWorker {
	#connection!: Connection;
	#channel!: Channel;
	#config: WorkerConfig;
	#dlx!: string;
	#dlq!: string;
	#retryQueue!: string;

	constructor(config: WorkerConfig) {
		this.#config = {
			...defaultConfig,
			...config
		};
		this.#connection = null!;
		this.#channel = null!;
		this.#dlx = null!;
		this.#dlq = null!;
		this.#retryQueue = null!;
	}

	async init() {
		console.log(`✅ Initializing ${this.#config.queue} worker`);
		await this.#setup();
		await this.#consumer();
		await this.#dlqConsumer();
	}

	async #connect() {
		const { channel, connection } = await connectRabbitMQ();
		this.#connection = connection;
		this.#channel = channel;
	}

	async #assertMainQueue() {
		if (!this.#channel) await this.#connect();
		const options = {
			durable: this.#config.durable,
			exclusive: this.#config.exclusive,
			arguments: this.#config.enableRetry
				? {
						"x-dead-letter-exchange": "",
						"x-dead-letter-routing-key": this.#retryQueue
				  }
				: {}
		};
		await this.#channel.assertQueue(this.#config.queue, options);
		if (this.#config.exchange) {
			await this.#channel.assertExchange(
				this.#config.exchange!,
				this.#config.exchangeType!,
				options
			);
			await this.#channel.bindQueue(
				this.#config.queue,
				this.#config.exchange!,
				this.#config.routingKey!
			);
		}
	}

	async #assertDLQRetry() {
		if (!this.#channel) await this.#connect();
		// setup dead letter queue and exchange
		if (this.#config.enableDLQ) {
			await this.#channel.assertExchange(this.#dlx, "direct", {
				durable: true
			});
			await this.#channel.assertQueue(this.#dlq, {
				durable: true
			});
			await this.#channel.bindQueue(this.#dlq, this.#dlx, "");
		}

		// setup retry queue and bind dlq exchange with retry queue
		if (this.#config.enableRetry) {
			await this.#channel.assertQueue(this.#retryQueue, {
				durable: true,
				arguments: {
					"x-message-ttl": Math.max(this.#config.retryTtl ?? 5000, 1000),
					"x-dead-letter-exchange": this.#config.exchange
						? this.#config.exchange
						: "",
					"x-dead-letter-routing-key": this.#config.routingKey
						? this.#config.routingKey
						: this.#config.queue
				}
			});
		}
	}

	async #setup() {
		this.#dlx = `${this.#config.queue}.dlx`;
		this.#dlq = `${this.#config.queue}.dlq`;
		this.#retryQueue = `${this.#config.queue}.retry`;

		try {
			await this.#connect();

			//Setup main queue
			await this.#assertMainQueue();

			//Setup DLQ and Retry
			await this.#assertDLQRetry();

			//Setup custom init
			await this.#config.onInit?.(this.#channel);
		} catch (error) {
			console.log(error);
		}
	}

	async send(
		data: any,
		callback?: (
			channel: Channel,
			queue: string,
			exchange: string,
			routingKey: string
		) => Promise<void>
	) {
		console.log("Sending message to", this.#config.queue);
		const exchange = this.#config.exchange || "";
		const routingKey = this.#config.routingKey || this.#config.queue;

		if (exchange) {
			// Publish to exchange with routing key
			await this.#channel.publish(
				exchange,
				routingKey,
				Buffer.isBuffer(data) ? data : Buffer.from(JSON.stringify(data))
			);
		} else {
			// If no exchange, send directly to queue
			await this.#channel.sendToQueue(
				routingKey,
				Buffer.isBuffer(data) ? data : Buffer.from(JSON.stringify(data))
			);
		}
		await callback?.(
			this.#channel,
			this.#config.queue,
			this.#config.exchange!,
			this.#config.routingKey!
		);
	}

	async #consumer() {
		await this.#channel.consume(this.#config.queue, async (msg) => {
			if (!msg) return null;
			// Check if this is a retry
			const headers = msg.properties.headers || {};
			let retryCount = headers["x-retry-count"] || 0;
			console.log("Received message from", this.#config.queue);
			try {
				await this.#config.onReceive?.(msg, this.#channel);
			} catch (error: any) {
				if (!this.#config.enableRetry) {
					if (!this.#config.enableDLQ) {
						console.log(
							"Retry not enabled, DLQ not enabled, nacking message"
						);
						this.#channel.nack(msg, false, false);
					} else {
						console.log("Retry not enabled, sending to DLQ");
						this.#channel.sendToQueue(this.#dlq, msg.content, {
							headers: {
								"x-retry-count": retryCount,
								"x-error": error.message
							}
						});
					}
					return;
				}
				// increment retry count
				retryCount++;

				if (retryCount >= this.#config.maxRetries!) {
					console.log("Max retries reached, sending to DLQ");
					// Send to the DLQ
					this.#channel.sendToQueue(this.#dlq, msg.content, {
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
				this.#channel.sendToQueue(this.#retryQueue, msg.content, {
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
		if (!this.#config.enableDLQ) return;
		await this.#channel.consume(this.#dlq, async (msg) => {
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
