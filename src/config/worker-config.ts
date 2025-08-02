const workerConfig = {
	email: {
		queue: "email-queue",
		exchange: "email.topic",
		routingKey: "email.#",
		type: "topic",
		maxRetries: 3
	},
	order: {
		queue: "order-queue",
		exchange: "order.topic",
		routingKey: "order.#",
		type: "topic",
		maxRetries: 3
	},
	payment: {
		queue: "payment-queue",
		exchange: "payment.topic",
		routingKey: "payment.#",
		type: "topic",
		maxRetries: 3
	}
};

export default workerConfig;
