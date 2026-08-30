import { z } from "zod";
import { RequestStatus } from "@/generated/prisma/enums";
import { PaginationSchema } from "./querySchema";

export const DailyRequestQuerySchema =
    PaginationSchema.extend({

        status:
            z.nativeEnum(RequestStatus)
                .optional(),

        branchId:
            z.uuid()
                .optional(),

        createdById:
            z.uuid()
                .optional(),

        sort:
            z.enum([
                "businessDate",
                "createdAt",
                "updatedAt",
                "status",
            ])
                .optional(),

        order:
            z.enum([
                "asc",
                "desc",
            ])
                .default("desc"),

        search:
            z.string()
                .trim()
                .min(1)
                .optional(),
        
        completedAt:
            z.string()
                .date() // Zod 3.23+ — validates "YYYY-MM-DD" format
                .optional(),
        
        assignedToId:
            z.uuid()
                .optional(),

    });

export type DailyRequestQuery =
    z.infer<typeof DailyRequestQuerySchema>;