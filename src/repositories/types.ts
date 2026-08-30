import { PrismaClient, Prisma } from "@/generated/prisma/client";

export type DbClient =
    PrismaClient | Prisma.TransactionClient;