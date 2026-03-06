import { Request, Response, NextFunction } from "express";
import jwt, { SignOptions } from "jsonwebtoken";
import { env } from "../config/env";

export interface JwtPayload {
  userId: string;
  email?: string;
  evmAddress?: string;
  telegramId?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function jwtAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, env.authSecret) as JwtPayload;
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function signAccessToken(payload: JwtPayload): string {
  const opts: SignOptions = { expiresIn: env.jwtAccessExpiry as any };
  return jwt.sign(payload as object, env.authSecret, opts);
}

export function signRefreshToken(payload: JwtPayload): string {
  const opts: SignOptions = { expiresIn: env.jwtRefreshExpiry as any };
  return jwt.sign(payload as object, env.authSecret, opts);
}
