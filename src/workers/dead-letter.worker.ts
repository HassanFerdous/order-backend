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

		// setup dead-letter queue
		this.channel.assertExchange(
			workerConfig.dead_letter.exchange,
			workerConfig.dead_letter.type,
			{ durable: true }
		);
		this.channel.assertQueue(workerConfig.dead_letter.queue, {
			durable: true
		});
		this.channel.bindQueue(
			workerConfig.dead_letter.queue,
			workerConfig.dead_letter.exchange,
			workerConfig.dead_letter.routingKey
		);

		// setup retry queue
		this.channel.assertQueue(workerConfig.retry.queue, {
			durable: true,
			arguments: {
				"x-message-ttl": 5000,
				"x-dead-letter-exchange": workerConfig.email.exchange,
				"x-dead-letter-routing-key": workerConfig.email.routingKey
			}
		});
		this.channel.bindQueue(
			workerConfig.retry.queue,
			workerConfig.dead_letter.exchange,
			workerConfig.retry.routingKey
		);
	}

	async #consumer() {
		if (!this.channel) await this.#init();

		// Consumer for the dead-letter queue
		this.channel.consume(
			workerConfig.dead_letter.queue,
			async (msg: ConsumeMessage | null) => {
				if (!msg) return;

				const content = msg.content.toString();
				const headers = msg.properties.headers || {};

				console.log("Received dead letter message:", content);
				console.log("Headers:", headers);

				// Acknowledge the message to remove it from the dead-letter queue
				this.channel.ack(msg);
			}
		);
	}

	static async start() {
		const worker = new DeadLetterWorker();
		await worker.#init();
		await worker.#consumer();
		console.log("Dead letter worker started");
	}
}
