import { z } from "zod";

export const CreateDailyRequestSchema = z.object({

    businessDate: z.iso.datetime(),

    branchId: z.uuid(),

    //createdById: z.uuid(),

});

export type CreateDailyRequestDto =
    z.infer<typeof CreateDailyRequestSchema>;
