// import workerConfig from "@/config/worker-config";
// import connectRabbitMQ from "@/lib/rabbitmq";
// import { Channel, Connection, ConsumeMessage } from "amqplib";

// export default class DeadLetterWorker {
// 	connection!: Connection;
// 	channel!: Channel;

// 	constructor() {
// 		this.connection = null!;
// 		this.channel = null!;
// 	}

// 	async #init() {
// 		const { connection, channel } = await connectRabbitMQ();
// 		this.connection = connection;
// 		this.channel = channel;

// 		// setup dead-letter queue
// 		this.channel.assertExchange(workerConfig.dead_letter.exchange, workerConfig.dead_letter.type, { durable: true });
// 		this.channel.assertQueue(workerConfig.dead_letter.queue, {
// 			durable: true
// 		});
// 		this.channel.bindQueue(
// 			workerConfig.dead_letter.queue,
// 			workerConfig.dead_letter.exchange,
// 			workerConfig.dead_letter.routingKey
// 		);

// 		// setup retry queue
// 		this.channel.assertQueue(workerConfig.retry.queue, { durable: true, arguments: { "x-message-ttl": 5000 } });
// 		this.channel.bindQueue(
// 			workerConfig.retry.queue,
// 			workerConfig.dead_letter.exchange,
// 			workerConfig.retry.routingKey
// 		);
// 	}

// 	async #consumer() {
// 		if (!this.channel) await this.#init();

// 		this.channel.consume(workerConfig.dead_letter.queue, async (msg: ConsumeMessage | null) => {
// 			if (!msg) return;
// 			console.log("Received dead letter message:", msg.content.toString());
// 			this.channel.ack(msg);
// 		});
// 	}

// 	async #retryConsumer() {
// 		await this.channel.consume(workerConfig.retry.queue, (msg) => {
// 			if (!msg) return;

// 			const headers = msg.properties.headers || {};
// 			let retryCount = parseInt(headers["x-retry-count"] || "0");

// 			const routingKey = headers["x-original-routing-key"];
// 			const exchange = headers["x-original-exchange"] || "";

// 			if (!routingKey) {
// 				console.warn("Missing x-original-routing-key");
// 				return this.channel.nack(msg, false, false);
// 			}

// 			retryCount++;

// 			if (retryCount >= workerConfig.email.maxRetries) {
// 				console.log(`❌ Retry limit reached (${retryCount}). Sending to DLQ.`);

// 				this.channel.sendToQueue(workerConfig.dead_letter.queue, msg.content, {
// 					persistent: true
// 				});

// 				return this.channel.ack(msg);
// 			}

// 			const updatedHeaders = {
// 				...headers,
// 				"x-retry-count": retryCount
// 			};

// 			console.log(`🔁 Retrying #${retryCount} → ${routingKey}`);

// 			this.channel.sendToQueue(routingKey, msg.content, {
// 				headers: updatedHeaders,
// 				persistent: true
// 			});

// 			this.channel.ack(msg);
// 		});
// 	}

// 	static async start() {
// 		const worker = new DeadLetterWorker();
// 		await worker.#init();
// 		await worker.#consumer();
// 		await worker.#retryConsumer();
// 		console.log("Dead letter worker started");
// 	}
// }
