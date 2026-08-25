import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { createApplicationSchema, type CreateApplicationInput } from "./application.schemas";
import { nextStatus, type ApplicationEvent, type ApplicationStatus } from "./state-machine";
import { ACT_RULES } from "./act-rules";

@Injectable()
export class ApplicationsService {
  constructor(private readonly prisma: PrismaService) {}
  async create(input: CreateApplicationInput) {
    const data = createApplicationSchema.parse(input);
    const sequence = await this.prisma.application.count({ where: { districtCode: data.districtCode } });
    const applicationNumber = `WB/${data.actCode}/${data.districtCode}/${new Date().getUTCFullYear()}/${String(sequence + 1).padStart(5, "0")}`;
    return this.prisma.application.create({ data: { ...data, applicationNumber } });
  }
  async get(id: string) {
    const application = await this.prisma.application.findUnique({ where: { id }, include: { parties: true, documents: true, witnesses: true } });
    if (!application) throw new NotFoundException("Application not found");
    return application;
  }
  async transition(id: string, event: ApplicationEvent, reason?: string) {
    const application = await this.get(id); const current = application.status as ApplicationStatus; const status = nextStatus(current, event);
    if (event === "reject" && (!reason || reason.length < 20)) throw new BadRequestException("A rejection reason of at least 20 characters is required");
    const rule = ACT_RULES[application.actCode];
    const now = new Date(); const deadline = "deadlineMonths" in rule ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + rule.deadlineMonths, now.getUTCDate())) : undefined;
    return this.prisma.$transaction(async tx => {
      const updateData: { status: ApplicationStatus; version: { increment: number }; cancelledReason?: string; submittedAt?: Date; receiptDate?: Date; registrationDeadlineAt?: Date } = { status, version: { increment: 1 } };
      if (event === "reject" && reason) updateData.cancelledReason = reason;
      if (event === "submit") { updateData.submittedAt = now; updateData.receiptDate = now; if (deadline) updateData.registrationDeadlineAt = deadline; }
      const updated = await tx.application.updateMany({ where: { id, version: application.version }, data: updateData });
      if (updated.count !== 1) throw new BadRequestException("Application was changed by another officer; reload and retry");
      await tx.auditEvent.create({ data: { entityType: "Application", entityId: id, applicationId: id, event, actorRole: "SYSTEM", before: { status: current }, after: { status } } });
      return tx.application.findUniqueOrThrow({ where: { id } });
    });
  }
}
