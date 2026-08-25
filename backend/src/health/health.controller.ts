import { Controller, Get } from "@nestjs/common";
@Controller()
export class HealthController {
  @Get("/healthz") liveness(): { status: "ok"; service: string } { return { status: "ok", service: "marreg-api" }; }
  @Get("/readyz") readiness(): { status: "ok"; checks: Record<string, "pending" | "ok"> } { return { status: "ok", checks: { database: "pending", redis: "pending", storage: "pending", grips: "pending" } }; }
}
