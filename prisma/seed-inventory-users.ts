import "dotenv/config";
import bcrypt from "bcrypt";
import { prisma } from "../src/lib/prisma";

async function main() {
    const password = process.env.INVENTORY_SEED_PASSWORD;

    if (!password) {
        throw new Error("Set INVENTORY_SEED_PASSWORD before running.");
    }

    const role = await prisma.role.findUnique({
        where: { code: "INV" },
    });

    if (!role) {
        throw new Error("The INV role must already exist.");
    }

    const branches = await prisma.branch.findMany({
        where: { isActive: true },
        orderBy: { code: "asc" },
    });

    const passwordHash = await bcrypt.hash(password, 10);

    const results = await prisma.$transaction(async (tx) => {
        const accounts: {
            branch: string;
            username: string;
            id: string;
            result: string;
        }[] = [];

        for (const branch of branches) {
            const username = `inventory_${branch.code}`;

            const existing = await tx.user.findUnique({
                where: { username },
            });

            if (existing) {
                if (
                    existing.branchId !== branch.id ||
                    existing.roleId !== role.id
                ) {
                    throw new Error(
                        `${username} already belongs to another branch or role.`
                    );
                }

                accounts.push({
                    branch: branch.code,
                    username,
                    id: existing.id,
                    result: existing.isActive
                        ? "Already exists; unchanged"
                        : "Inactive account; unchanged",
                });

                continue;
            }

            const user = await tx.user.create({
                data: {
                    username,
                    passwordHash,
                    firstName: "Inventory",
                    lastName: branch.code,
                    branchId: branch.id,
                    roleId: role.id,
                    isActive: true,
                },
            });

            accounts.push({
                branch: branch.code,
                username,
                id: user.id,
                result: "Created",
            });
        }

        return accounts;
    }, { timeout: 30000 });

    console.table(results);
}

main()
    .catch((error: unknown) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });