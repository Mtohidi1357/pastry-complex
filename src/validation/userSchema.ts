import { z } from "zod";
import { id } from "zod/locales";

export const UserQuerySchema = z.object({

    username: z
        .string()
        .min(1)
        .optional(),

    id: z.uuid().optional(),

    branchId: 
        z.string().optional(),


});

export type UserQuerySchemaDto =
    z.infer<typeof UserQuerySchema>;
