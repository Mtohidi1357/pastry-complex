import { PrismaClient } from "../../src/generated/prisma/client";
import { BranchType } from "../../src/generated/prisma/enums";

const branches = [
  {
    code: "BR01",
    name: "Shahran Sales Branch 1",
    displayName: "شعبه شهران",
    type: BranchType.SALES,
  },
  {
    code: "BR02",
    name: "Marzdaran Sales Branch 2",
    displayName: " شعبه مرزداران",
    type: BranchType.SALES,
  },
  {
    code: "WS01",
    name: "Bakery Workshop",
    displayName: "کارگاه تولید",
    type: BranchType.BAKERY,
  },
] as const;

export async function seedBranches(prisma: PrismaClient){
    for (const branch of branches) {
        await prisma.branch.upsert({
            where: {
            code: branch.code,
            },
            update: {
            name: branch.name,
            type: branch.type,
            },
            create: branch,
        });
    }

    console.log(`✓ ${branches.length} branches seeded`);
}
