import router from "@domains/v1/order/api";
import { Router } from "express";
export default function defineRoutes(expressRouter: Router) {
	expressRouter.use("/orders", router);
};
