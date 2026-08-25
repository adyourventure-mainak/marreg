import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApplicationsService } from "./applications.service";
import { createApplicationSchema, transitionSchema } from "./application.schemas";
@Controller("applications")
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}
  @Post() create(@Body() body: unknown) { return this.applications.create(createApplicationSchema.parse(body)); }
  @Get(":id") get(@Param("id") id: string) { return this.applications.get(id); }
  @Post(":id/transition") transition(@Param("id") id: string, @Body() body: unknown) { const input = transitionSchema.parse(body); return this.applications.transition(id, input.event as Parameters<ApplicationsService["transition"]>[1], input.reason); }
}
