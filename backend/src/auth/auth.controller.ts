import { Body, Controller, Post } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { requestOtpSchema, verifyOtpSchema } from "./auth.schemas";
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Post("otp/request") request(@Body() body: unknown) { return this.auth.requestOtp(requestOtpSchema.parse(body)); }
  @Post("otp/verify") verify(@Body() body: unknown) { return this.auth.verifyOtp(verifyOtpSchema.parse(body)); }
}
