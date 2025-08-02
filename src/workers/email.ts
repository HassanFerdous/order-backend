import workerConfig from "@/config/worker-config";
import { sendEmail } from "@/lib/mailer";
import connectRabbitMQ from "@/lib/rabbitmq";
import { EmailPayload } from "..";

export const emailWorker = async (data: EmailPayload) => {
	try {
		const { channel } = await connectRabbitMQ();
		channel.assertExchange(
			workerConfig.email.exchange,
			workerConfig.email.type,
			{ durable: true }
		);
		const queue = await channel.assertQueue(workerConfig.email.queue, {
			durable: true
		});
		channel.bindQueue(
			queue.queue,
			workerConfig.email.exchange,
			workerConfig.email.routingKey
		);
		channel.publish(
			workerConfig.email.exchange,
			workerConfig.email.routingKey,
			Buffer.from(JSON.stringify(data))
		);
		console.log("✅ Email sent to queue");
	} catch (error) {
		console.error("❌ Failed to send email:", error);
	}
};

export const emailConsumer = async () => {
	try {
		const { channel } = await connectRabbitMQ();
		channel.assertExchange(
			workerConfig.email.exchange,
			workerConfig.email.type,
			{ durable: true }
		);
		const queue = await channel.assertQueue(workerConfig.email.queue, {
			durable: true
		});
		channel.bindQueue(
			queue.queue,
			workerConfig.email.exchange,
			workerConfig.email.routingKey
		);
		channel.consume(queue.queue, async (msg) => {
			if (msg) {
				const data = JSON.parse(msg.content.toString()) as EmailPayload;
				console.log("📧 Received email from Queue");
				await sendEmail(data);
				channel.ack(msg);
			}
		});
	} catch (error) {
		console.error("❌ Failed to start email worker:", error);
	}
};
