import { prisma } from "../src/lib/prisma";
import { seedRoles } from "./seed/roles";
import { seedBranches } from "./seed/branches";
import { seedProductCategories } from "./seed/productCategories";
import { seedProducts } from "./seed/products";
import { seedUsers } from "./seed/users";

async function main() {
  console.log("🌱 Starting database seed...");

  await seedRoles(prisma);
  await seedBranches(prisma);
  await seedProductCategories(prisma);
  await seedProducts(prisma);
  await seedUsers(prisma);

  console.log("✅ Seed completed.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });