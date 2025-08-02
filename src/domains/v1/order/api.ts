import auth from "@/middlewares/auth.middleware";
import validate from "@/middlewares/validate.middleware";
import { sendSuccess } from "@/utils/response";
import express, { Request, Response } from "express";
import { User } from "../user/service";
import { OrderServices } from "./service";
import { createOrderSchema } from "./validation";

const router = express.Router();

// Create
router.post(
	"/",
	auth,
	validate({ body: createOrderSchema }),
	async (req: Request, res: Response) => {
		const user = req.user as User;
		const data = await OrderServices.create({
			...req.body,
			userId: user.id
		});
		sendSuccess(res, data, 201, "Successfully created new order!");
	}
);

// Read all orders by userId
router.get("/", auth, async (req: Request, res: Response) => {
	const user = req.user as User;
	const data = await OrderServices.getAllByUserId(user.id);
	sendSuccess(res, data, 200, "Successfully fetched all order!");
});

// Read one
router.get("/:id", async (req: Request, res: Response) => {
	const id = +req.params.id;
	const data = await OrderServices.getById(id);
	sendSuccess(res, data, 200, "Successfully fetched order!");
});

// Update
router.put("/:id", async (req: Request, res: Response) => {
	const id = +req.params.id;
	await OrderServices.update(id, req.body);
	const data = await OrderServices.getById(id);
	sendSuccess(res, data, 200, "Successfully updated order!");
});

// Delete
router.delete("/:id", async (req: Request, res: Response) => {
	const id = +req.params.id;
	const data = await OrderServices.delete(id);
	sendSuccess(res, data, 200, "Successfully deleted order!");
});

export default router;
