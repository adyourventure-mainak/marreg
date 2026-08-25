import { z } from "zod";
export const createApplicationSchema = z.object({
  actCode: z.enum(["HMA_1955", "SMA_13", "SMA_16", "ICMA_1872", "PMDA_1936"]),
  districtCode: z.string().min(2).max(20),
  policeStationCode: z.string().min(2).max(30),
});
export const transitionSchema = z.object({ event: z.string(), reason: z.string().min(20).optional() });
export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;
