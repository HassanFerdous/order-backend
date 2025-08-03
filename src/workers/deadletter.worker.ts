import workerConfig from "@/config/worker-config";
import connectRabbitMQ from "@/lib/rabbitmq";
import { Channel, Connection, ConsumeMessage } from "amqplib";

export default class DeadLetterWorker {
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

		// Setup Dead letter Queue
		this.channel.assertExchange(
			workerConfig.dlq.exchange,
			workerConfig.dlq.type,
			{
				durable: true
			}
		);
		this.channel.assertQueue(workerConfig.dlq.queue, {
			durable: true
		});
		this.channel.bindQueue(
			workerConfig.dlq.queue,
			workerConfig.dlq.exchange,
			workerConfig.dlq.routingKey
		);

		// Setup Retry Queue
		this.channel.assertQueue(workerConfig.retry.queue, {
			durable: true,
			arguments: {
				"x-message-ttl": 5000 // 10 seconds delay before retry,
			}
		});
		this.channel.assertExchange(
			workerConfig.retry.exchange,
			workerConfig.retry.type,
			{
				durable: true
			}
		);
		this.channel.bindQueue(
			workerConfig.retry.queue,
			workerConfig.retry.exchange,
			workerConfig.retry.routingKey
		);
	}

	async #consumer() {
		if (!this.channel) await this.#init();

		this.channel.consume(
			workerConfig.dlq.queue,
			async (msg: ConsumeMessage | null) => {
				if (!msg) return;

				const headers = msg.properties.headers as Record<string, any>;
				const originalExchange = headers["x-original-exchange"];
				const originalRoutingKey = headers["x-original-routing-key"];

				if (!originalExchange || !originalRoutingKey) {
					console.error(
						"Missing original exchange or routing key in headers",
						headers
					);
					this.channel.ack(msg);
					return;
				}

				try {
					// Forward the message to the original exchange + routing key
					this.channel.publish(
						originalExchange,
						originalRoutingKey,
						msg.content,
						{
							headers,
							persistent: true
						}
					);

					console.log(
						`✔ Re-published message to ${originalExchange} with routing key ${originalRoutingKey}`
					);
					this.channel.ack(msg);
				} catch (err) {
					console.error(
						"❌ Failed to re-publish dead letter message:",
						err
					);
					this.channel.nack(msg, false, false); // Drop or move to permanent DLQ
				}
			}
		);
	}

	async #retryConsumer() {
		await this.channel.consume(workerConfig.retry.queue, (msg) => {
			if (!msg) return;
			const headers = msg.properties.headers as Record<string, any>;
			const retries = parseInt(headers["x-retry-count"]);
			console.log("Received retry message:", msg);
			this.channel.ack(msg);
		});
	}

	static async start() {
		const worker = new DeadLetterWorker();
		await worker.#init();
		await worker.#consumer();
		await worker.#retryConsumer();
		console.log("Dead letter worker started");
	}
}
