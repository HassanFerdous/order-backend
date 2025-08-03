import amqp, { Channel, Connection } from "amqplib";
import { config } from "@/config";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface RabbitMQConnection {
	connection: Connection;
	channel: Channel;
}

const connectRabbitMQ = async (): Promise<RabbitMQConnection> => {
	const { host, port, defaultUser, defaultPass } = config.rabbitmq;
	const url = `amqp://${defaultUser}:${defaultPass}@${host}:${port}`;
	const maxRetries = 5;
	let attempt = 0;

	while (attempt < maxRetries) {
		try {
			console.log(
				`🔌 Attempting RabbitMQ connection: ${url} (try ${attempt + 1})`
			);
			const connection = await amqp.connect(url);
			const channel = await connection.createChannel();
			console.log("✅ RabbitMQ connected successfully");
			return { connection, channel } as unknown as RabbitMQConnection;
		} catch (error: unknown) {
			const errMsg = error instanceof Error ? error.message : String(error);
			console.error(
				`❌ RabbitMQ connection failed (attempt ${attempt + 1}):`,
				errMsg
			);
			attempt++;
			if (attempt < maxRetries) {
				await sleep(3000);
			} else {
				throw new Error(
					"❌ Could not connect to RabbitMQ after multiple retries."
				);
			}
		}
	}
	// This line is unreachable but TS requires a return or throw.
	throw new Error("❌ Unexpected error connecting to RabbitMQ.");
};

export default connectRabbitMQ;
