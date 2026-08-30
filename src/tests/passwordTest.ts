import {
    hashPassword,
    verifyPassword,
} from "@/features/auth/password";

async function main() {

    const hash = await hashPassword("1234");

    console.log("Hash:");
    console.log(hash);

    console.log(
        "Correct:",
        await verifyPassword(
            "1234",
            hash
        )
    );

    console.log(
        "Wrong:",
        await verifyPassword(
            "abcd",
            hash
        )
    );
}

main();