import { prisma } from "@/lib/prisma";
import { transition } from "@/features/workflow/transitionService";
import { WorkflowAction } from "@/features/workflow/wrokFlowDefinition";
import { Roles } from "@/lib/constants/roles";

async function main() {
    const inventoryUser =
        await prisma.user.findUnique({
            where: {
                username: "inventory",
            },
        });

    if (!inventoryUser) {
        throw new Error("Inventory user not found.");
    }

    const branch = await prisma.branch.findFirst({
        where: {
            code: "BR01"
        }
    });

    const request = await prisma.dailyRequest.create({
        data: {

            businessDate: new Date(),

            status: "DRAFT",

            branchId: branch!.id,

            createdById: inventoryUser.id,

            submittedAt: new Date(),
        }
    });

    const currentUser = {
        ...inventoryUser,
        roleCode: Roles.WM
    };

    const updated =
        await transition({

            requestId: request.id,

            currentUser: currentUser,

            action:
                WorkflowAction.SUBMIT_INVENTORY,
        });

    const result =
        await prisma.dailyRequest.findUnique({

            where: {
                id: request.id,
            },

            include: {
                history: true,
            },
        });

    if (!result) {
        throw new Error("Request disappeared.");
    }

    if (result.status !== "INVENTORY_SUBMITTED") {
        throw new Error("Status transition failed.");
    }

    if (!result.submittedAt) {
        throw new Error("submittedAt was not set.");
    }

    if (result.history.length !== 1) {
        throw new Error("Workflow history was not created.");
    }

    console.log("✅ Workflow transition passed.");

    await prisma.workflowHistory.deleteMany({
        where: {
            dailyRequestId: request.id,
        },
    });

    await prisma.dailyRequest.delete({
        where: {
            id: request.id,
        },
    });

    console.log("✅ Cleanup done.");

}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });