import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";

export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers["x-api-key"];
  if (!apiKey || apiKey !== env.adminApiKey) {
    res.status(401).json({ error: "Unauthorized: invalid or missing API key" });
    return;
  }
  next();
}
