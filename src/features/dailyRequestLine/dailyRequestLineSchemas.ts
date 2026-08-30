import { z } from "zod";
enum UpdateLineOperation {
    RECORD_INVENTORY= "RECORD_INVENTORY",
    RECORD_REQUESTEDQTY= "RECORD_REQUESTEDQTY",
    RECORD_PRODUCTION= "RECORD_PRODUCTION",
    RECORD_RECEIVEDQTY= "RECORD_RECEIVEDQTY",
}

const UpdateLineOperationSchema = z.enum([
  UpdateLineOperation.RECORD_INVENTORY,
  UpdateLineOperation.RECORD_REQUESTEDQTY,
  UpdateLineOperation.RECORD_PRODUCTION,
  UpdateLineOperation.RECORD_RECEIVEDQTY,
]);

export const CreateLineSchema  = z.object({
    productId: z.string(),
    requestedQty: z
        .number()
        .nonnegative(),
    prevBalance: z
        .number()
        .nonnegative()
        .default(0),
    currentBalance: z
        .number()
        .nonnegative()
        .default(0),
});

export const UpdateLineSchema = z.object({
    operation: UpdateLineOperationSchema,
    producedQty: z.number().int().min(0).optional(),
    requestedQty: z.number().int().min(0).optional(),
    previousBalance: z.number().int().min(0).optional(),
    currentBalance: z.number().int().min(0).optional(),
    receivedQty: z.number().int().min(0).optional(),
});
