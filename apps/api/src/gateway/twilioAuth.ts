import type { NextFunction, Request, Response } from "express";
import twilio from "twilio";

// Twilio signs every webhook request with HMAC-SHA1 over the exact request
// URL plus sorted POST params, using the account's auth token as the key.
// Without this check, anyone who learns the webhook URL could POST forged
// messages and have them processed as if they came from a real WhatsApp
// user — including ones impersonating an already-linked phone number.
export function verifyTwilioSignature(req: Request, res: Response, next: NextFunction) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.warn("TWILIO_AUTH_TOKEN not set; skipping webhook signature validation.");
    return next();
  }

  const signature = req.header("X-Twilio-Signature");
  const url = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
  const valid = !!signature && twilio.validateRequest(authToken, signature, url, req.body);

  if (!valid) {
    console.error("Rejected WhatsApp webhook: invalid or missing Twilio signature.");
    return res.status(403).send("Invalid signature");
  }

  next();
}
